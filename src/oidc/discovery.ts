import type { AuthKit } from "../config.js";
import { buildIssuerUrl, normalizeIssuer } from "../issuerUrl.js";

export function getOpenIdConfiguration(kit: AuthKit): Record<string, unknown> {
	const issuer = normalizeIssuer(kit.config.issuer);
	return {
		issuer,
		authorization_endpoint: buildIssuerUrl(
			kit.config.issuer,
			"/authorize",
		).href,
		token_endpoint: buildIssuerUrl(kit.config.issuer, "/token").href,
		jwks_uri: buildIssuerUrl(kit.config.issuer, "/.well-known/jwks.json")
			.href,
		response_types_supported: ["code"],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: ["RS256"],
		scopes_supported: ["openid", "profile", "email"],
		token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
		code_challenge_methods_supported: ["S256"],
		grant_types_supported: ["authorization_code", "refresh_token"],
	};
}
