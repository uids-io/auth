import {
	type CryptoKey,
	createLocalJWKSet,
	createRemoteJWKSet,
	exportJWK,
	generateKeyPair,
	importJWK,
	type JWK,
	jwtVerify,
	SignJWT,
} from "jose";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { AuthConfig } from "../config.js";
import { verifyCodeChallenge } from "../crypto/pkce.js";
import { generateOpaqueToken } from "../crypto/random.js";
import { hashToken, verifyTokenHash } from "../crypto/tokens.js";
import { InvalidRequestError, UnauthorizedError } from "../errors.js";
import {
	type AccessTokenClaims,
	type AuthUser,
	type Device,
	type DevicePlatform,
	devicePlatformSchema,
	type TokenResponse,
} from "../types.js";
import type { SessionService } from "./SessionService.js";

interface SigningKeyRow {
	id: string;
	kid: string;
	alg: string;
	public_jwk: JWK;
	private_jwk: JWK | null;
}

interface RefreshTokenRow {
	id: string;
	session_id: string;
	token_hash: string;
	parent_token_id: string | null;
	rotated_at: Date | null;
	expires_at: Date;
	revoked_at: Date | null;
	user_id: string;
	client_id: string | null;
	device_id: string | null;
	device_external_id: string | null;
	platform: DevicePlatform | null;
}

export interface VerifyAccessTokenOptions {
	token: string;
	issuer: string;
	audience: string;
	jwksUrl?: string;
	localJwks?: JWK[];
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksUrl: string | undefined;

const accessTokenClaimsSchema = z.object({
	iss: z.string(),
	sub: z.string(),
	aud: z.union([z.string(), z.array(z.string())]),
	exp: z.number(),
	iat: z.number(),
	scope: z.string().optional(),
	client_id: z.string().optional(),
	email: z.string().optional(),
	email_verified: z.boolean().optional(),
	device_id: z.string().optional(),
	platform: devicePlatformSchema.optional(),
});

export class TokenService {
	private privateKeyCache = new Map<string, CryptoKey>();

	constructor(
		private readonly pool: Pool,
		private readonly config: AuthConfig,
		readonly _sessions: SessionService,
	) {}

	async ensureSigningKey(): Promise<void> {
		const { rows } = await this.pool.query(
			`SELECT id FROM auth.signing_keys WHERE active = true LIMIT 1`,
		);
		if (rows.length > 0) {
			return;
		}
		await this.createSigningKey();
	}

	async createSigningKey(): Promise<void> {
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		const privateJwk = await exportJWK(privateKey);
		const kid = generateOpaqueToken(16);

		publicJwk.kid = kid;
		publicJwk.alg = "RS256";
		privateJwk.kid = kid;
		privateJwk.alg = "RS256";

		await this.pool.query(
			`INSERT INTO auth.signing_keys (kid, alg, public_jwk, private_jwk, active)
       VALUES ($1, 'RS256', $2, $3, true)`,
			[kid, JSON.stringify(publicJwk), JSON.stringify(privateJwk)],
		);
	}

	async getActiveSigningKey(): Promise<{
		kid: string;
		privateKey: CryptoKey;
		publicJwk: JWK;
	}> {
		const { rows } = await this.pool.query<SigningKeyRow>(
			`SELECT id, kid, alg, public_jwk, private_jwk
       FROM auth.signing_keys WHERE active = true AND retired_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
		);
		if (!rows[0]?.private_jwk) {
			throw new Error("No active signing key with private JWK available");
		}

		const kid = rows[0].kid;
		let privateKey = this.privateKeyCache.get(kid);
		if (!privateKey) {
			privateKey = (await importJWK(rows[0].private_jwk, "RS256")) as CryptoKey;
			this.privateKeyCache.set(kid, privateKey);
		}

		return { kid, privateKey, publicJwk: rows[0].public_jwk };
	}

	async getPublicJwks(): Promise<{ keys: JWK[] }> {
		const { rows } = await this.pool.query<{ public_jwk: JWK }>(
			`SELECT public_jwk FROM auth.signing_keys
       WHERE active = true AND retired_at IS NULL
       ORDER BY created_at DESC`,
		);
		return { keys: rows.map((r) => r.public_jwk) };
	}

	async issueTokens(params: {
		user: AuthUser;
		clientId: string;
		scopes: string[];
		sessionId: number;
		device?: Device | null;
		nonce?: string;
		includeRefreshToken?: boolean;
		accessTokenTtlSeconds?: number;
		refreshTokenTtlSeconds?: number;
	}): Promise<TokenResponse> {
		const client = await this.pool.query<{
			access_token_ttl_seconds: number;
			refresh_token_ttl_seconds: number;
		}>(
			"SELECT access_token_ttl_seconds, refresh_token_ttl_seconds FROM auth.oauth_clients WHERE id = $1",
			[params.clientId],
		);
		const accessTtl =
			params.accessTokenTtlSeconds ??
			client.rows[0]?.access_token_ttl_seconds ??
			this.config.token.accessTokenTtlSeconds;
		const refreshTtl =
			params.refreshTokenTtlSeconds ??
			client.rows[0]?.refresh_token_ttl_seconds ??
			this.config.token.refreshTokenTtlSeconds;

		const { kid, privateKey } = await this.getActiveSigningKey();
		const now = Math.floor(Date.now() / 1000);
		const scopeStr = params.scopes.join(" ");

		const accessClaims: Record<string, unknown> = {
			scope: scopeStr,
			client_id: params.clientId,
		};
		if (params.user.primaryEmail) {
			accessClaims.email = params.user.primaryEmail;
			accessClaims.email_verified = params.user.emailVerified;
		}
		if (params.device && this.config.devices.includeInAccessToken) {
			accessClaims.device_id = params.device.deviceId;
			accessClaims.platform = params.device.platform;
		}

		const accessToken = await new SignJWT(accessClaims)
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(this.config.issuer)
			.setSubject(String(params.user.id))
			.setAudience(this.config.apiAudience)
			.setIssuedAt(now)
			.setExpirationTime(now + accessTtl)
			.sign(privateKey);

		const response: TokenResponse = {
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: accessTtl,
			scope: scopeStr,
		};

		if (params.scopes.includes("openid")) {
			const idClaims: Record<string, unknown> = {
				email: params.user.primaryEmail,
				email_verified: params.user.emailVerified,
				name: params.user.displayName,
			};
			if (params.nonce) {
				idClaims.nonce = params.nonce;
			}
			response.id_token = await new SignJWT(idClaims)
				.setProtectedHeader({ alg: "RS256", kid })
				.setIssuer(this.config.issuer)
				.setSubject(String(params.user.id))
				.setAudience(params.clientId)
				.setIssuedAt(now)
				.setExpirationTime(now + accessTtl)
				.sign(privateKey);
		}

		if (params.includeRefreshToken !== false) {
			const refreshToken = generateOpaqueToken(32);
			await this.pool.query(
				`INSERT INTO auth.refresh_tokens (session_id, token_hash, expires_at)
         VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
				[params.sessionId, hashToken(refreshToken), refreshTtl],
			);
			response.refresh_token = refreshToken;
		}

		return response;
	}

	async createAuthorizationCode(params: {
		clientId: string;
		userId: number;
		redirectUri: string;
		scopes: string[];
		codeChallenge: string;
		codeChallengeMethod: "S256";
		state?: string;
		nonce?: string;
		devicePk?: number;
		ttlSeconds?: number;
	}): Promise<string> {
		const code = generateOpaqueToken(32);
		const ttl = params.ttlSeconds ?? 600;
		await this.pool.query(
			`INSERT INTO auth.oauth_authorization_codes
         (code_hash, client_id, user_id, device_id, redirect_uri, scopes,
          code_challenge, code_challenge_method, state, nonce, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + ($11 || ' seconds')::interval)`,
			[
				hashToken(code),
				params.clientId,
				params.userId,
				params.devicePk ?? null,
				params.redirectUri,
				params.scopes,
				params.codeChallenge,
				params.codeChallengeMethod,
				params.state ?? null,
				params.nonce ?? null,
				ttl,
			],
		);
		return code;
	}

	async exchangeAuthorizationCode(params: {
		code: string;
		clientId: string;
		redirectUri: string;
		codeVerifier: string;
	}): Promise<{
		userId: number;
		scopes: string[];
		nonce?: string;
		devicePk?: number;
	}> {
		const codeHash = hashToken(params.code);
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const { rows } = await client.query<{
				user_id: string;
				scopes: string[];
				code_challenge: string;
				code_challenge_method: string;
				redirect_uri: string;
				client_id: string;
				nonce: string | null;
				device_id: string | null;
				consumed_at: Date | null;
				expires_at: Date;
			}>(
				`SELECT user_id, scopes, code_challenge, code_challenge_method, redirect_uri,
                client_id, nonce, device_id, consumed_at, expires_at
         FROM auth.oauth_authorization_codes WHERE code_hash = $1 FOR UPDATE`,
				[codeHash],
			);

			const row = rows[0];
			if (!row) {
				throw new InvalidRequestError(
					"Invalid authorization code",
					"invalid_grant",
				);
			}
			if (row.consumed_at) {
				throw new InvalidRequestError(
					"Authorization code already used",
					"invalid_grant",
				);
			}
			if (new Date(row.expires_at) <= new Date()) {
				throw new InvalidRequestError(
					"Authorization code expired",
					"invalid_grant",
				);
			}
			if (row.client_id !== params.clientId) {
				throw new InvalidRequestError("Client mismatch", "invalid_grant");
			}
			if (row.redirect_uri !== params.redirectUri) {
				throw new InvalidRequestError("Redirect URI mismatch", "invalid_grant");
			}
			if (
				!verifyCodeChallenge(
					params.codeVerifier,
					row.code_challenge,
					row.code_challenge_method,
				)
			) {
				throw new InvalidRequestError("Invalid PKCE verifier", "invalid_grant");
			}

			await client.query(
				`UPDATE auth.oauth_authorization_codes SET consumed_at = now() WHERE code_hash = $1`,
				[codeHash],
			);
			await client.query("COMMIT");

			return {
				userId: Number(row.user_id),
				scopes: row.scopes,
				nonce: row.nonce ?? undefined,
				devicePk: row.device_id ? Number(row.device_id) : undefined,
			};
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}

	async refreshAccessToken(refreshToken: string): Promise<{
		tokens: TokenResponse;
		sessionId: number;
		userId: number;
		clientId: string;
	}> {
		const tokenHash = hashToken(refreshToken);
		const client = await this.pool.connect();

		try {
			await client.query("BEGIN");
			const { rows } = await client.query<RefreshTokenRow>(
				`SELECT rt.id, rt.session_id, rt.token_hash, rt.parent_token_id, rt.rotated_at,
                rt.expires_at, rt.revoked_at,
                s.user_id, s.client_id, s.device_id,
                d.device_id AS device_external_id, d.platform
         FROM auth.refresh_tokens rt
         JOIN auth.sessions s ON s.id = rt.session_id
         LEFT JOIN auth.devices d ON d.id = s.device_id
         WHERE rt.token_hash = $1 FOR UPDATE`,
				[tokenHash],
			);

			const refreshTokenRow = rows[0];
			if (!refreshTokenRow) {
				throw new UnauthorizedError("Invalid refresh token", "invalid_grant");
			}

			if (refreshTokenRow.revoked_at || refreshTokenRow.rotated_at) {
				await this.revokeSessionChain(
					client,
					Number(refreshTokenRow.session_id),
				);
				await client.query("COMMIT");

				throw new UnauthorizedError(
					"Refresh token reuse detected",
					"invalid_grant",
				);
			}

			if (new Date(refreshTokenRow.expires_at) <= new Date()) {
				throw new UnauthorizedError("Refresh token expired", "invalid_grant");
			}

			const { rows: sessionRows } = await client.query<{ status: string }>(
				"SELECT status FROM auth.sessions WHERE id = $1",
				[refreshTokenRow.session_id],
			);

			if (sessionRows[0]?.status !== "active") {
				throw new UnauthorizedError("Session revoked", "invalid_grant");
			}

			await client.query(
				`UPDATE auth.refresh_tokens SET rotated_at = now() WHERE id = $1`,
				[refreshTokenRow.id],
			);

			const newRefreshToken = generateOpaqueToken();
			const refreshTtl = this.config.token.refreshTokenTtlSeconds;

			await client.query(
				`INSERT INTO auth.refresh_tokens (session_id, token_hash, parent_token_id, expires_at)
         VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
				[
					refreshTokenRow.session_id,
					hashToken(newRefreshToken),
					refreshTokenRow.id,
					refreshTtl,
				],
			);

			await client.query("COMMIT");

			const userId = Number(refreshTokenRow.user_id);
			const clientId = refreshTokenRow.client_id ?? "unknown";
			const { rows: userRows } = await this.pool.query<{
				primary_email: string | null;
				display_name: string | null;
				email_verified: boolean;
				status: string;
				created_at: Date;
				updated_at: Date;
			}>(
				"SELECT primary_email, display_name, email_verified, status, created_at, updated_at FROM auth.users WHERE id = $1",
				[userId],
			);
			const userRow = userRows[0];

			if (!userRow) {
				throw new UnauthorizedError("User not found", "invalid_grant");
			}

			const device: Device | null =
				refreshTokenRow.device_external_id && refreshTokenRow.platform
					? {
							id: Number(refreshTokenRow.device_id),
							deviceId: refreshTokenRow.device_external_id,
							clientId,
							userId,
							platform: refreshTokenRow.platform,
							platformVersion: null,
							appVersion: null,
							deviceName: null,
							userAgent: null,
							lastIp: null,
							status: "active",
							firstSeenAt: new Date(),
							lastSeenAt: new Date(),
							revokedAt: null,
						}
					: null;

			const tokens = await this.issueTokens({
				user: {
					id: userId,
					primaryEmail: userRow.primary_email,
					displayName: userRow.display_name,
					emailVerified: userRow.email_verified,
					status: userRow.status as AuthUser["status"],
					createdAt: userRow.created_at,
					updatedAt: userRow.updated_at,
				},
				clientId,
				scopes: ["openid", "profile", "email"],
				sessionId: Number(refreshTokenRow.session_id),
				device,
				includeRefreshToken: true,
			});
			tokens.refresh_token = newRefreshToken;

			return {
				tokens,
				sessionId: Number(refreshTokenRow.session_id),
				userId,
				clientId,
			};
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}

	private async revokeSessionChain(
		client: PoolClient,
		sessionId: number,
	): Promise<void> {
		await client.query(
			`UPDATE auth.sessions SET status = 'revoked', revoked_at = now() WHERE id = $1`,
			[sessionId],
		);

		await client.query(
			`UPDATE auth.refresh_tokens SET revoked_at = now()
       WHERE session_id = $1 AND revoked_at IS NULL`,
			[sessionId],
		);
	}

	async validateRefreshToken(refreshToken: string): Promise<boolean> {
		const { rows } = await this.pool.query(
			`SELECT id FROM auth.refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND rotated_at IS NULL AND expires_at > now()`,
			[hashToken(refreshToken)],
		);

		return rows.length > 0;
	}
}

export async function verifyAccessToken(
	options: VerifyAccessTokenOptions,
): Promise<AccessTokenClaims> {
	let jwks:
		| ReturnType<typeof createRemoteJWKSet>
		| ReturnType<typeof createLocalJWKSet>;

	if (options.localJwks) {
		jwks = createLocalJWKSet({ keys: options.localJwks });
	} else if (options.jwksUrl) {
		if (!cachedJwks || cachedJwksUrl !== options.jwksUrl) {
			cachedJwks = createRemoteJWKSet(new URL(options.jwksUrl));
			cachedJwksUrl = options.jwksUrl;
		}
		jwks = cachedJwks;
	} else {
		throw new Error("Either jwksUrl or localJwks must be provided");
	}

	const { payload } = await jwtVerify(options.token, jwks, {
		issuer: options.issuer,
		audience: options.audience,
	});

	return accessTokenClaimsSchema.parse(payload) as AccessTokenClaims;
}

export { verifyTokenHash };
