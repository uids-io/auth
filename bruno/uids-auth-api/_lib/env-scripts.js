/**
 * Copy into Bruno after-response / before-request blocks (OpenCollection inline scripts).
 * Bruno does not auto-import this file; keep in sync when editing scripts.
 */

function getHeader(res, name) {
	const lower = name.toLowerCase();
	if (typeof res?.getHeader === "function") {
		const viaGetter = res.getHeader(lower) ?? res.getHeader(name);
		if (viaGetter) return viaGetter;
	}
	if (Array.isArray(res?.headers)) {
		const h = res.headers.find(
			(x) => String(x?.name || x?.key || "").toLowerCase() === lower,
		);
		const value = h?.value ?? h?.val;
		if (value !== undefined && value !== null) return value;
	}
	const headers = res?.headers;
	if (headers && typeof headers === "object" && !Array.isArray(headers)) {
		return headers[lower] ?? headers[name];
	}
	return undefined;
}

function resolveRedirectLocation(res) {
	return (
		getHeader(res, "location") ??
		(res?.status >= 300 &&
		res?.status < 400 &&
		typeof res?.url === "string"
			? res.url
			: undefined)
	);
}

function parseQueryParam(redirectLocation, key) {
	if (!redirectLocation) return null;
	const match = String(redirectLocation).match(
		new RegExp(`[?&]${key}=([^&#]*)`),
	);
	if (!match?.[1]) return null;
	try {
		return decodeURIComponent(match[1].replace(/\+/g, " "));
	} catch {
		return match[1];
	}
}

/** Parses OAuth redirect Location (login or portal callback) into Bruno env vars. */
function parseOAuthRedirectLocation(redirectLocation) {
	if (!redirectLocation || typeof redirectLocation !== "string") return;

	const authBase = bru.getEnvVar("authBaseUrl") || "http://localhost:3000";
	const portalCallback = bru.getEnvVar("redirectUri") || authBase;

	let pathname = "";
	let code = null;
	let state = null;

	try {
		const parsed = new URL(redirectLocation, authBase);
		pathname = parsed.pathname || "";
		code = parsed.searchParams.get("code");
		state = parsed.searchParams.get("state");
	} catch {
		try {
			const parsed = new URL(redirectLocation, portalCallback);
			pathname = parsed.pathname || "";
			code = parsed.searchParams.get("code");
			state = parsed.searchParams.get("state");
		} catch {
			pathname =
				redirectLocation.replace(/\?.*$/, "").replace(/^[^:]+:\/\/[^/]+/, "") ||
				"";
			code = parseQueryParam(redirectLocation, "code");
			state = parseQueryParam(redirectLocation, "state");
		}
	}

	if (!code) code = parseQueryParam(redirectLocation, "code");
	if (!state) state = parseQueryParam(redirectLocation, "state");

	if (code) bru.setEnvVar("authorizationCode", code);

	if (state) {
		if (/\/login\/?$/i.test(pathname)) {
			bru.setEnvVar("pendingState", state);
		} else {
			bru.setEnvVar("oauthState", state);
		}
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
	const redirectLocation = resolveRedirectLocation(res);
	if (redirectLocation) parseOAuthRedirectLocation(redirectLocation);
}

function applyTokensFromResponse(res) {
	applyTokenBody(res.body);
	applySetCookieHeaders(res);
}
