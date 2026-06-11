import type { Request } from "express";

import { buildIssuerUrl } from "../issuerUrl.js";
import type { PendingAuthContext } from "../types.js";

/** True when the client expects a JSON body (embedded SPA login), not an HTTP redirect. */
export function prefersJsonResponse(req: Request): boolean {
	const accept = req.headers.accept;

	if (typeof accept === "string" && accept.includes("application/json")) {
		return true;
	}

	return req.accepts(["json", "html"]) === "json";
}

/** Extracts OAuth authorization code from a portal callback redirect URL. */
export function oauthCallbackFromRedirectUrl(redirectUrl: string): {
	code: string;
	state: string | null;
} | null {
	try {
		const parsed = new URL(redirectUrl);
		const code = parsed.searchParams.get("code");

		if (!code) {
			return null;
		}

		return { code, state: parsed.searchParams.get("state") };
	} catch {
		return null;
	}
}

export function renderLoginPage(params: {
	issuer: string;
	state?: string;
	googleEnabled: boolean;
	microsoftEnabled: boolean;
	emailEnabled: boolean;
}): string {
	const returnTo = params.state
		? `?state=${encodeURIComponent(params.state)}`
		: "";

	const providers: string[] = [];

	if (params.googleEnabled) {
		const googleStart = buildIssuerUrl(
			params.issuer,
			"/oauth/google/start",
		);
		providers.push(
			`<a class="btn" href="${googleStart.href}${returnTo}">Continue with Google</a>`,
		);
	}
	if (params.microsoftEnabled) {
		const microsoftStart = buildIssuerUrl(
			params.issuer,
			"/oauth/microsoft/start",
		);
		providers.push(
			`<a class="btn" href="${microsoftStart.href}${returnTo}">Continue with Microsoft</a>`,
		);
	}
	if (params.emailEnabled) {
		const passwordLogin = buildIssuerUrl(
			params.issuer,
			"/email/password/login",
		);
		providers.push(`
      <form method="POST" action="${passwordLogin.href}">
        <input type="hidden" name="pending_state" value="${params.state ?? ""}" />
        <label>Email <input type="email" name="email" required /></label>
        <label>Password <input type="password" name="password" required /></label>
        <button type="submit">Sign in with Email</button>
      </form>
    `);
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sign in</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 4rem auto; padding: 0 1rem; }
    .btn { display: block; margin: 0.75rem 0; padding: 0.75rem 1rem; text-align: center;
           background: #111; color: #fff; text-decoration: none; border-radius: 6px; }
    form { margin-top: 1.5rem; display: grid; gap: 0.75rem; }
    label { display: grid; gap: 0.25rem; font-size: 0.9rem; }
    input { padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
    button { padding: 0.75rem; background: #111; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Sign in</h1>
  ${providers.join("\n")}
</body>
</html>`;
}

export function parseFormBody(body: unknown): Record<string, string> {
	if (!body || typeof body !== "object") {
		return {};
	}
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(body)) {
		if (typeof value === "string") {
			result[key] = value;
		}
	}
	return result;
}

export function getClientIp(req: {
	ip?: string;
	headers: Record<string, string | string[] | undefined>;
}): string | undefined {
	const forwarded = req.headers["x-forwarded-for"];

	if (typeof forwarded === "string") {
		return forwarded.split(",")[0]?.trim();
	}

	return req.ip;
}

export function getUserAgent(req: {
	headers: Record<string, string | string[] | undefined>;
}): string | undefined {
	const ua = req.headers["user-agent"];

	return typeof ua === "string" ? ua : undefined;
}

export function buildPendingFromQuery(
	query: Record<string, unknown>,
): PendingAuthContext | null {
	if (typeof query.state !== "string") {
		return null;
	}

	return { type: "oauth_authorize", returnTo: query.state };
}

export function parseCookies(
	cookieHeader: string | undefined,
): Record<string, string> {
	if (!cookieHeader) {
		return {};
	}

	const cookies: Record<string, string> = {};

	for (const part of cookieHeader.split(";")) {
		const [rawKey, ...rest] = part.trim().split("=");

		if (rawKey) {
			cookies[rawKey] = decodeURIComponent(rest.join("="));
		}
	}

	return cookies;
}
