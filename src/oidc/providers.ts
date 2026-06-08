import type { AuthKit } from "../config.js";
import { buildIssuerUrl, normalizeIssuer } from "../issuerUrl.js";

export type AuthLoginProviderId = "google" | "microsoft" | "email";

export type AuthIdpConsole = "google_cloud" | "microsoft_entra";

export interface AuthProviderInfo {
	id: AuthLoginProviderId;
	enabled: boolean;
	/**
	 * URIs to register as authorized redirect URIs in the IdP developer console.
	 * Present for Google/Microsoft (canonical path from issuer when not yet configured).
	 */
	authorizedRedirectUris?: string[];
	/** Where to register {@link AuthProviderInfo.authorizedRedirectUris}. */
	idpConsole?: AuthIdpConsole;
}

export interface AuthProvidersResponse {
	issuer: string;
	providers: AuthProviderInfo[];
}

/**
 * Public list of login methods configured on this auth server.
 * Portals use this to render Sign in with Google / Microsoft / Email buttons.
 */
function socialProviderInfo(
	id: "google" | "microsoft",
	enabled: boolean,
	callbackUrl: string | undefined,
	issuer: string,
	idpConsole: AuthIdpConsole,
): AuthProviderInfo {
	const canonicalRedirectUri = buildIssuerUrl(
		issuer,
		`/oauth/${id}/callback`,
	).href;

	return {
		id,
		enabled,
		authorizedRedirectUris: [callbackUrl ?? canonicalRedirectUri],
		idpConsole,
	};
}

export function getAuthProviders(kit: AuthKit): AuthProvidersResponse {
	const issuer = normalizeIssuer(kit.config.issuer);
  
	return {
		issuer,
		providers: [
			socialProviderInfo(
				"google",
				Boolean(kit.config.providers.google),
				kit.config.providers.google?.callbackUrl,
				issuer,
				"google_cloud",
			),
			socialProviderInfo(
				"microsoft",
				Boolean(kit.config.providers.microsoft),
				kit.config.providers.microsoft?.callbackUrl,
				issuer,
				"microsoft_entra",
			),
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
