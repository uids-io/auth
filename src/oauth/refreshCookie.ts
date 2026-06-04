import type { Response } from "express";
import type { AuthKit } from "../config.js";
import { parseCookies } from "../express/helpers.js";

/** Request header: ask server to deliver refresh token as HttpOnly cookie (web SDK). */
export const TOKEN_DELIVERY_HEADER = "x-uids-token-delivery";

export const REFRESH_TOKEN_COOKIE_NAME = "uids_refresh_token";

export function wantsCookieTokenDelivery(
	headers: Record<string, string | string[] | undefined>,
): boolean {
	const value = headers[TOKEN_DELIVERY_HEADER];
	return (
		(typeof value === "string" && value.toLowerCase() === "cookie") ||
		(Array.isArray(value) && value.some((v) => v.toLowerCase() === "cookie"))
	);
}

export function getRefreshTokenFromRequest(req: {
	headers: { cookie?: string };
	body?: Record<string, unknown>;
}): string | undefined {
	const body = req.body?.refresh_token;
	if (typeof body === "string" && body.length > 0) {
		return body;
	}
	const cookies = parseCookies(req.headers.cookie);
	const fromCookie = cookies[REFRESH_TOKEN_COOKIE_NAME];
	return typeof fromCookie === "string" && fromCookie.length > 0
		? fromCookie
		: undefined;
}

export function setRefreshTokenCookie(
	kit: AuthKit,
	res: Response,
	refreshToken: string,
	maxAgeSeconds?: number,
): void {
	const ttl = maxAgeSeconds ?? kit.config.token.refreshTokenTtlSeconds;

	res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
		...kit.sessions.getCookieOptions(ttl),
		httpOnly: true,
		path: "/",
	});
}

export function clearRefreshTokenCookie(kit: AuthKit, res: Response): void {
	res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
		...kit.sessions.getCookieOptions(),
		path: "/",
	});
}

export function stripRefreshFromJson<T extends { refresh_token?: string }>(
	tokens: T,
): T {
	if (!tokens.refresh_token) {
		return tokens;
	}
	const { refresh_token: _removed, ...rest } = tokens;
	return rest as T;
}
