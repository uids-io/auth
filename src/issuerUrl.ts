/**
 * Canonical issuer string (no trailing slash) for OIDC metadata and comparisons.
 */
export function normalizeIssuer(issuer: string): string {
	return issuer.replace(/\/$/, "");
}

/**
 * Builds a URL under the auth issuer, preserving path prefixes (e.g. `/api/auth`).
 * `new URL("/login", "http://host/api/auth")` incorrectly resolves to `/login` at site root.
 */
export function buildIssuerUrl(issuer: string, pathname: string): URL {
	const base = normalizeIssuer(issuer);
	const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return new URL(`${base}${path}`);
}
