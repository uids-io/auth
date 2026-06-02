import type { Pool } from "pg";
import { hashSecret } from "../crypto/password.js";
import { InvalidRequestError } from "../errors.js";
import type { OAuthClient } from "../types.js";

interface ClientRow {
	id: string;
	name: string;
	client_type: OAuthClient["clientType"];
	allowed_redirect_uris: string[];
	allowed_origins: string[];
	allowed_scopes: string[];
	access_token_ttl_seconds: number;
	refresh_token_ttl_seconds: number;
	enabled: boolean;
}

function mapClient(row: ClientRow): OAuthClient {
	return {
		id: row.id,
		name: row.name,
		clientType: row.client_type,
		allowedRedirectUris: row.allowed_redirect_uris,
		allowedOrigins: row.allowed_origins,
		allowedScopes: row.allowed_scopes,
		accessTokenTtlSeconds: row.access_token_ttl_seconds,
		refreshTokenTtlSeconds: row.refresh_token_ttl_seconds,
		enabled: row.enabled,
	};
}

export interface SeedPortalClientsInput {
	merchantRedirectUris: string[];
	agencyRedirectUris: string[];
	influencerRedirectUris: string[];
	adminRedirectUris: string[];
	merchantOrigins?: string[];
	agencyOrigins?: string[];
	influencerOrigins?: string[];
	adminOrigins?: string[];
}

function originsFromRedirectUris(uris: string[]): string[] {
	return [...new Set(uris.map((uri) => new URL(uri).origin))];
}

export class OAuthClientService {
	constructor(private readonly pool: Pool) {}

	async getClient(clientId: string): Promise<OAuthClient | null> {
		const { rows } = await this.pool.query<ClientRow>(
			`SELECT id, name, client_type, allowed_redirect_uris, allowed_origins,
              allowed_scopes, access_token_ttl_seconds, refresh_token_ttl_seconds, enabled
       FROM auth.oauth_clients WHERE id = $1`,
			[clientId],
		);
		return rows[0] ? mapClient(rows[0]) : null;
	}

	async requireClient(clientId: string): Promise<OAuthClient> {
		const client = await this.getClient(clientId);

		if (client == null || !client?.enabled) {
			throw new InvalidRequestError("Invalid client_id", "invalid_client");
		}

		return client;
	}

	validateRedirectUri(client: OAuthClient, redirectUri: string): void {
		if (!client.allowedRedirectUris.includes(redirectUri)) {
			throw new InvalidRequestError(
				"Invalid redirect_uri",
				"invalid_redirect_uri",
			);
		}
	}

	validateScopes(client: OAuthClient, requestedScopes: string[]): void {
		for (const scope of requestedScopes) {
			if (!client.allowedScopes.includes(scope)) {
				throw new InvalidRequestError(
					`Invalid scope: ${scope}`,
					"invalid_scope",
				);
			}
		}
	}

	async getAllAllowedOrigins(globalOrigins: string[] = []): Promise<string[]> {
		const { rows } = await this.pool.query<{ origin: string }>(
			`SELECT DISTINCT unnest(allowed_origins) AS origin FROM auth.oauth_clients WHERE enabled = true`,
		);
		return [...new Set([...globalOrigins, ...rows.map((r) => r.origin)])];
	}

	async upsertPublicClient(params: {
		id: string;
		name: string;
		redirectUris: string[];
		origins?: string[];
	}): Promise<void> {
		const origins =
			params.origins ?? originsFromRedirectUris(params.redirectUris);
		await this.pool.query(
			`INSERT INTO auth.oauth_clients
         (id, name, client_type, allowed_redirect_uris, allowed_origins)
       VALUES ($1, $2, 'public', $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
         allowed_origins = EXCLUDED.allowed_origins`,
			[params.id, params.name, params.redirectUris, origins],
		);
	}

	async upsertConfidentialClient(params: {
		id: string;
		name: string;
		secret: string;
		redirectUris: string[];
		origins?: string[];
	}): Promise<void> {
		const secretHash = await hashSecret(params.secret);
		const origins =
			params.origins ?? originsFromRedirectUris(params.redirectUris);
		await this.pool.query(
			`INSERT INTO auth.oauth_clients
         (id, name, client_type, client_secret_hash, allowed_redirect_uris, allowed_origins)
       VALUES ($1, $2, 'confidential', $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         client_secret_hash = EXCLUDED.client_secret_hash,
         allowed_redirect_uris = EXCLUDED.allowed_redirect_uris,
         allowed_origins = EXCLUDED.allowed_origins`,
			[params.id, params.name, secretHash, params.redirectUris, origins],
		);
	}
}

export async function seedDefaultPortalClients(
	pool: Pool,
	input: SeedPortalClientsInput,
): Promise<void> {
	const service = new OAuthClientService(pool);
	await service.upsertPublicClient({
		id: "merchant_portal_web",
		name: "Merchant Portal Web",
		redirectUris: input.merchantRedirectUris,
		origins: input.merchantOrigins,
	});
	await service.upsertPublicClient({
		id: "agency_portal_web",
		name: "Agency Portal Web",
		redirectUris: input.agencyRedirectUris,
		origins: input.agencyOrigins,
	});
	await service.upsertPublicClient({
		id: "influencer_portal_web",
		name: "Influencer Portal Web",
		redirectUris: input.influencerRedirectUris,
		origins: input.influencerOrigins,
	});
	await service.upsertPublicClient({
		id: "admin_portal_web",
		name: "Admin Portal Web",
		redirectUris: input.adminRedirectUris,
		origins: input.adminOrigins,
	});
}
