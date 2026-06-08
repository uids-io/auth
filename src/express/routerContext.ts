import type { Request, Response } from "express";
import type { AuthKit } from "../config.js";
import { parseCookies } from "./helpers.js";

export interface AuthRouterContext {
	kit: AuthKit;
	getSessionToken: (req: Request) => string | undefined;
	setSessionCookie: (
		res: Response,
		sessionToken: string,
		csrfToken: string,
		maxAgeSeconds?: number,
	) => void;
	clearSessionCookies: (res: Response) => void;
	resolveAuthenticatedUserId: (req: Request) => Promise<number | null>;
	sendUnauthorized: (res: Response) => void;
	getQueryStringParam: (value: unknown) => string | undefined;
}

function getCookies(req: Request): Record<string, string> {
	return req.cookies ?? parseCookies(req.headers.cookie);
}

function getSessionToken(req: Request, kit: AuthKit): string | undefined {
	const cookie = getCookies(req)[kit.config.cookie.name];

	if (typeof cookie === "string") {
		return kit.sessions.verifySessionCookie(cookie) ?? undefined;
	}

	return undefined;
}

async function getBearerUserId(
	req: Request,
	kit: AuthKit,
): Promise<number | null> {
	const authHeader = req.headers.authorization;

	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}

	try {
		const { verifyAccessToken } = await import("../services/tokenService.js");

		const claims = await verifyAccessToken({
			token: authHeader.slice(7),
			issuer: kit.config.issuer,
			audience: kit.config.apiAudience,
			localJwks: (await kit.tokens.getPublicJwks()).keys,
		});

		return Number(claims.sub);
	} catch {
		return null;
	}
}

async function resolveAuthenticatedUserId(
	req: Request,
	kit: AuthKit,
): Promise<number | null> {
	const sessionToken = getSessionToken(req, kit);

	if (sessionToken) {
		const session = await kit.sessions.getSessionByToken(sessionToken);

		if (session) {
			return session.userId;
		}
	}

	return getBearerUserId(req, kit);
}

export function createAuthRouterContext(kit: AuthKit): AuthRouterContext {
	return {
		kit,
		getSessionToken: (req: Request): string | undefined =>
			getSessionToken(req, kit),
		setSessionCookie: (
			res: Response,
			sessionToken: string,
			csrfToken: string,
			maxAgeSeconds?: number,
		): void => {
			const signed = kit.sessions.signSessionCookie(sessionToken);

			res.cookie(
				kit.config.cookie.name,
				signed,
				kit.sessions.getCookieOptions(maxAgeSeconds),
			);

			res.cookie("uids_csrf", csrfToken, {
				...kit.sessions.getCookieOptions(maxAgeSeconds),
				httpOnly: false,
			});
		},
		clearSessionCookies: (res: Response): void => {
			res.clearCookie(kit.config.cookie.name, kit.sessions.getCookieOptions());
			res.clearCookie("uids_csrf", kit.sessions.getCookieOptions());
		},
		resolveAuthenticatedUserId: (req: Request): Promise<number | null> =>
			resolveAuthenticatedUserId(req, kit),
		sendUnauthorized: (res: Response): void => {
			res.status(401).json({ error: "unauthorized" });
		},
		getQueryStringParam: (value: unknown): string | undefined =>
			typeof value === "string" ? value : undefined,
	};
}
