import type { AuthKit } from "../config.js";

export type AuthLoginProviderId = "google" | "microsoft" | "email";

export interface AuthProviderInfo {
	id: AuthLoginProviderId;
	enabled: boolean;
}

export interface AuthProvidersResponse {
	issuer: string;
	providers: AuthProviderInfo[];
}

/**
 * Public list of login methods configured on this auth server.
 * Portals use this to render Sign in with Google / Microsoft / Email buttons.
 */
export function getAuthProviders(kit: AuthKit): AuthProvidersResponse {
	const issuer = kit.config.issuer.replace(/\/$/, "");
	return {
		issuer,
		providers: [
			{ id: "google", enabled: Boolean(kit.config.providers.google) },
			{
				id: "microsoft",
				enabled: Boolean(kit.config.providers.microsoft),
			},
			{ id: "email", enabled: true },
		],
	};
}

export function isLoginProviderEnabled(
	kit: AuthKit,
	provider: AuthLoginProviderId,
): boolean {
	const list = getAuthProviders(kit).providers;
	return list.find((p) => p.id === provider)?.enabled ?? false;
}

const PROVIDER_IDS: AuthLoginProviderId[] = ["google", "microsoft", "email"];

export function parseLoginProvider(
	value: unknown,
): AuthLoginProviderId | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const normalized = value.toLowerCase();
	if (PROVIDER_IDS.includes(normalized as AuthLoginProviderId)) {
		return normalized as AuthLoginProviderId;
	}
	return undefined;
}
