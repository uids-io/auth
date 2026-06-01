import type { AuthKit } from "../config.js";
import { generateOpaqueToken } from "../crypto/random.js";
import { hashToken } from "../crypto/tokens.js";
import { InvalidRequestError } from "../errors.js";
import { completePendingAuthorize } from "../oauth/authorize.js";
import { sendMagicLinkEmail } from "./emailSender.js";

export async function startMagicLink(
	kit: AuthKit,
	params: {
		email: string;
		clientId?: string;
		redirectUri?: string;
		state?: string;
		codeChallenge?: string;
		codeChallengeMethod?: "S256";
	},
): Promise<void> {
	if (!kit.config.email.sendMagicLink) {
		throw new InvalidRequestError(
			"Magic link not configured",
			"magic_link_disabled",
		);
	}

	await kit.auth.checkRateLimit(`magic:email:${params.email.toLowerCase()}`);

	if (params.clientId) {
		const client = await kit.oauthClients.requireClient(params.clientId);
		if (params.redirectUri) {
			kit.oauthClients.validateRedirectUri(client, params.redirectUri);
		}
	}

	const token = generateOpaqueToken(32);
	const tokenHash = hashToken(token);
	const ttl = 900;

	await kit.pool.query(
		`INSERT INTO auth.magic_links
       (token_hash, email, client_id, redirect_uri, state, code_challenge, code_challenge_method, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' seconds')::interval)`,
		[
			tokenHash,
			params.email.toLowerCase(),
			params.clientId ?? null,
			params.redirectUri ?? null,
			params.state ?? null,
			params.codeChallenge ?? null,
			params.codeChallengeMethod ?? null,
			ttl,
		],
	);

	const url = new URL("/email/magic/callback", kit.config.issuer);
	url.searchParams.set("token", token);
	await sendMagicLinkEmail(kit, params.email, url.toString());
}

export async function consumeMagicLink(
	kit: AuthKit,
	params: { token: string; ip?: string; userAgent?: string },
): Promise<{
	redirectUrl: string;
	sessionToken: string;
	csrfToken: string;
	userId: number;
}> {
	const tokenHash = hashToken(params.token);
	const client = await kit.pool.connect();
	try {
		await client.query("BEGIN");
		const { rows } = await client.query<{
			email: string;
			client_id: string | null;
			redirect_uri: string | null;
			state: string | null;
			code_challenge: string | null;
			code_challenge_method: string | null;
			consumed_at: Date | null;
			expires_at: Date;
		}>(
			`SELECT email, client_id, redirect_uri, state, code_challenge, code_challenge_method,
              consumed_at, expires_at
       FROM auth.magic_links WHERE token_hash = $1 FOR UPDATE`,
			[tokenHash],
		);

		const row = rows[0];
		if (!row) {
			throw new InvalidRequestError("Invalid magic link", "invalid_token");
		}
		if (row.consumed_at) {
			throw new InvalidRequestError("Magic link already used", "invalid_token");
		}
		if (new Date(row.expires_at) <= new Date()) {
			throw new InvalidRequestError("Magic link expired", "invalid_token");
		}

		await client.query(
			`UPDATE auth.magic_links SET consumed_at = now() WHERE token_hash = $1`,
			[tokenHash],
		);
		await client.query("COMMIT");

		let user = await kit.users.findByEmail(row.email);
		if (!user) {
			user = await kit.users.createUser({
				email: row.email,
				emailVerified: true,
			});
			await kit.users.linkIdentity(user.id, {
				provider: "email",
				providerSubject: row.email,
				email: row.email,
				emailVerified: true,
				rawProfile: {},
			});
		}

		const { sessionToken, csrfToken } = await kit.sessions.createSession({
			userId: user.id,
			clientId: row.client_id ?? undefined,
			ip: params.ip,
			userAgent: params.userAgent,
		});

		await kit.auth.recordLoginAttempt({
			email: row.email,
			provider: "email",
			success: true,
			ip: params.ip,
			userAgent: params.userAgent,
		});
		await kit.config.hooks.onLogin?.(user, "email");

		if (row.state) {
			const pending = await kit.auth.consumePendingContext(row.state);
			if (pending) {
				const url = await completePendingAuthorize(kit, user.id, pending);
				if (url) {
					return { redirectUrl: url, sessionToken, csrfToken, userId: user.id };
				}
			}
		}

		if (
			row.client_id &&
			row.redirect_uri &&
			row.code_challenge &&
			row.code_challenge_method === "S256"
		) {
			await kit.auth.savePendingContext(row.state ?? "magic", {
				type: "oauth_authorize",
				clientId: row.client_id,
				redirectUri: row.redirect_uri,
				scopes: ["openid", "profile", "email"],
				state: row.state ?? undefined,
				codeChallenge: row.code_challenge,
				codeChallengeMethod: "S256",
			});
		}

		return {
			redirectUrl: `${kit.config.issuer}/session`,
			sessionToken,
			csrfToken,
			userId: user.id,
		};
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}
