import type { Pool } from "pg";
import { OAuthClientService } from "../../src/services/oauthClientService.js";

/**
 * UIDs product portal OAuth clients — for local example and integration tests only.
 * Not part of the @advcomm/uids-io-auth public API.
 */
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
