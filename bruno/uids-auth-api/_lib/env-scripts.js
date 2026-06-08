/**
 * Copy into Bruno after-response / before-request blocks (OpenCollection inline scripts).
 * Bruno does not auto-import this file; keep in sync when editing scripts.
 */

function getHeader(res, name) {
	const lower = name.toLowerCase();
	if (Array.isArray(res.headers)) {
		const h = res.headers.find(
			(x) => String(x.name || x.key || "").toLowerCase() === lower,
		);
		return h?.value ?? h?.val;
	}
	return res.headers?.[name] ?? res.headers?.[lower];
}

function applyRedirectUrl(url) {
	if (!url || typeof url !== "string") return;
	try {
		const base = bru.getEnvVar("authBaseUrl") || "http://localhost:3000";
		const u = new URL(url, base);
		const code = u.searchParams.get("code");
		const state = u.searchParams.get("state");
		if (code) bru.setEnvVar("authorizationCode", code);
		if (state) {
			if (u.pathname.endsWith("/login")) {
				bru.setEnvVar("pendingState", state);
			} else {
				bru.setEnvVar("oauthState", state);
			}
		}
	} catch (_) {
		/* ignore invalid URL */
	}
}

function applySetCookieHeaders(res) {
	const raw = getHeader(res, "set-cookie");
	if (!raw) return;
	const lines = Array.isArray(raw) ? raw : [raw];
	for (const line of lines) {
		const csrf = String(line).match(/uids_csrf=([^;]+)/);
		if (csrf?.[1]) bru.setEnvVar("csrfToken", csrf[1]);
		const session = String(line).match(/uids_auth_session=([^;]+)/);
		if (session?.[1]) bru.setEnvVar("sessionCookie", session[1]);
	}
}

function applyTokenBody(body) {
	if (!body || typeof body !== "object") return;
	if (body.access_token) bru.setEnvVar("accessToken", String(body.access_token));
	if (body.refresh_token) bru.setEnvVar("refreshToken", String(body.refresh_token));
}

function clearAuthTokens() {
	bru.setEnvVar("accessToken", "");
	bru.setEnvVar("refreshToken", "");
	bru.setEnvVar("authorizationCode", "");
}

function ensurePkcePair() {
	const existing = bru.getEnvVar("codeVerifier");
	if (existing && String(existing).length > 0) return;
	const crypto = require("node:crypto");
	const verifier = crypto.randomBytes(32).toString("base64url");
	const challenge = crypto
		.createHash("sha256")
		.update(verifier)
		.digest("base64url");
	bru.setEnvVar("codeVerifier", verifier);
	bru.setEnvVar("codeChallenge", challenge);
}

function applyRedirectFromResponse(res) {
	const location = getHeader(res, "location");
	if (location) applyRedirectUrl(location);
}

function applyTokensFromResponse(res) {
	applyTokenBody(res.body);
	applySetCookieHeaders(res);
}
