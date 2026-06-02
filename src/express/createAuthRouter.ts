import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { AuthKit } from "../config.js";
import {
	handleDeviceList,
	handleDeviceRegister,
	handleDeviceRevoke,
} from "../devices/handlers.js";
import { consumeMagicLink, startMagicLink } from "../email/magicLink.js";
import {
	loginWithPassword,
	registerWithPassword,
} from "../email/passwordLogin.js";
import { isAuthError } from "../errors.js";
import { handleAuthorize } from "../oauth/authorize.js";
import {
	handleSocialCallback,
	type SocialProvider,
	startSocialLogin,
} from "../oauth/callback.js";
import { handleLogout } from "../oauth/logout.js";
import { handleRefresh } from "../oauth/refresh.js";
import { handleTokenExchange } from "../oauth/token.js";
import { getOpenIdConfiguration } from "../oidc/discovery.js";
import { getJwks } from "../oidc/jwks.js";
import { DEVICE_ID_HEADER, parseDeviceContext } from "../types.js";
import {
	getClientIp,
	getUserAgent,
	parseCookies,
	parseFormBody,
	renderLoginPage,
} from "./helpers.js";

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

function setSessionCookie(
	res: Response,
	kit: AuthKit,
	sessionToken: string,
	csrfToken: string,
	maxAgeSeconds?: number,
): void {
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
}

function clearSessionCookies(res: Response, kit: AuthKit): void {
	res.clearCookie(kit.config.cookie.name, kit.sessions.getCookieOptions());
	res.clearCookie("uids_csrf", kit.sessions.getCookieOptions());
}

function validateCsrf(req: Request): boolean {
	const cookies = getCookies(req);
	const header = req.headers["x-csrf-token"];
	const cookie = cookies.uids_csrf;

	if (typeof header !== "string" || typeof cookie !== "string") {
		return false;
	}

	return header === cookie;
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
		const { verifyAccessToken } = await import("../services/TokenService.js");
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

function sendError(res: Response, error: unknown): void {
	if (isAuthError(error)) {
		const body: Record<string, unknown> = {
			error: error.code,
			error_description: error.message,
		};
		if ("retryAfterSeconds" in error && error.retryAfterSeconds) {
			res.setHeader("Retry-After", String(error.retryAfterSeconds));
		}
		res.status(error.statusCode).json(body);
		return;
	}
	console.error(error);
	res.status(500).json({
		error: "server_error",
		error_description: "Internal server error",
	});
}

function sendUnauthorized(res: Response): void {
	res.status(401).json({ error: "unauthorized" });
}

function getQueryStringParam(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function registerSocialProviderRoutes(
	router: Router,
	kit: AuthKit,
	provider: SocialProvider,
): void {
	router.get(`/oauth/${provider}/start`, async (req, res, next) => {
		try {
			const state = getQueryStringParam(req.query.state);
			const url = await startSocialLogin(kit, provider, { pendingState: state });
			res.redirect(url);
		} catch (error) {
			next(error);
		}
	});

	router.get(`/oauth/${provider}/callback`, async (req, res, next) => {
		try {
			const code = getQueryStringParam(req.query.code);
			const state = getQueryStringParam(req.query.state);
			if (!code || !state) {
				res.status(400).json({ error: "invalid_request" });
				return;
			}
			const result = await handleSocialCallback(kit, provider, {
				code,
				state,
				ip: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			const session = await kit.sessions.createSession({
				userId: result.userId,
			});
			setSessionCookie(res, kit, session.sessionToken, session.csrfToken);
			res.redirect(result.redirectUrl);
		} catch (error) {
			next(error);
		}
	});
}

function corsMiddleware(kit: AuthKit) {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		const origin = req.headers.origin;
		if (origin) {
			const allowed = await kit.oauthClients.getAllAllowedOrigins(
				kit.config.globalAllowedOrigins,
			);
			if (allowed.includes(origin)) {
				res.setHeader("Access-Control-Allow-Origin", origin);
				res.setHeader("Access-Control-Allow-Credentials", "true");
				res.setHeader("Vary", "Origin");
				res.setHeader(
					"Access-Control-Allow-Headers",
					`Content-Type, Authorization, X-CSRF-Token, ${DEVICE_ID_HEADER}`,
				);
				res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			}
		}
		if (req.method === "OPTIONS") {
			res.status(204).end();
			return;
		}
		next();
	};
}

function csrfMiddleware(kit: AuthKit) {
	return (req: Request, res: Response, next: NextFunction): void => {
		if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
			next();
			return;
		}
		const cookies = getCookies(req);
		const hasSession = Boolean(cookies[kit.config.cookie.name]);
		if (hasSession && cookies.uids_csrf && !validateCsrf(req)) {
			res.status(403).json({
				error: "csrf_failed",
				error_description: "CSRF validation failed",
			});
			return;
		}
		next();
	};
}

export function createAuthRouter(kit: AuthKit): Router {
	const router = createRouter();
	router.use(corsMiddleware(kit));

	router.get("/.well-known/openid-configuration", (_req, res) => {
		res.json(getOpenIdConfiguration(kit));
	});

	router.get("/.well-known/jwks.json", async (_req, res, next) => {
		try {
			res.json(await getJwks(kit));
		} catch (error) {
			next(error);
		}
	});

	router.get("/login", (req, res) => {
		res.type("html").send(
			renderLoginPage({
				issuer: kit.config.issuer.replace(/\/$/, ""),
				state:
					typeof req.query.state === "string" ? req.query.state : undefined,
				googleEnabled: !!kit.config.providers.google,
				microsoftEnabled: !!kit.config.providers.microsoft,
				emailEnabled: true,
			}),
		);
	});

	router.get("/authorize", async (req, res, next) => {
		try {
			const deviceCtx = parseDeviceContext(
				req.headers as Record<string, string | string[] | undefined>,
				undefined,
				req.query as Record<string, unknown>,
			);
			const result = await handleAuthorize(kit, {
				query: req.query as Record<string, unknown>,
				sessionToken: getSessionToken(req, kit),
				deviceId: deviceCtx.deviceId,
				platform: deviceCtx.platform,
			});
			res.redirect(result.url);
		} catch (error) {
			next(error);
		}
	});

	router.post("/token", async (req, res, next) => {
		try {
			const tokens = await handleTokenExchange(
				kit,
				req.body as Record<string, unknown>,
			);
			res.json(tokens);
		} catch (error) {
			next(error);
		}
	});

	router.post("/refresh", async (req, res, next) => {
		try {
			const tokens = await handleRefresh(
				kit,
				req.body as Record<string, unknown>,
			);
			res.json(tokens);
		} catch (error) {
			next(error);
		}
	});

	router.post("/logout", csrfMiddleware(kit), async (req, res, next) => {
		try {
			await handleLogout(kit, {
				sessionToken: getSessionToken(req, kit),
				refreshToken:
					typeof req.body?.refresh_token === "string"
						? req.body.refresh_token
						: undefined,
			});
			clearSessionCookies(res, kit);
			res.json({ success: true });
		} catch (error) {
			next(error);
		}
	});

	registerSocialProviderRoutes(router, kit, "google");
	registerSocialProviderRoutes(router, kit, "microsoft");

	router.post("/email/password/register", async (req, res, next) => {
		try {
			const body = req.body as Record<string, unknown>;
			const email = body.email;
			const password = body.password;
			if (typeof email !== "string" || typeof password !== "string") {
				res.status(400).json({ error: "invalid_request" });
				return;
			}
			const result = await registerWithPassword(kit, {
				email,
				password,
				displayName:
					typeof body.display_name === "string" ? body.display_name : undefined,
			});
			res.status(201).json({ user_id: result.userId });
		} catch (error) {
			next(error);
		}
	});

	router.post("/email/password/login", async (req, res, next) => {
		try {
			const body = {
				...parseFormBody(req.body),
				...(req.body as object),
			} as Record<string, unknown>;
			const email = body.email;
			const password = body.password;
			if (typeof email !== "string" || typeof password !== "string") {
				res.status(400).json({ error: "invalid_request" });
				return;
			}
			const deviceCtx = parseDeviceContext(
				req.headers as Record<string, string | string[] | undefined>,
				body,
			);
			const result = await loginWithPassword(kit, {
				email,
				password,
				clientId:
					typeof body.client_id === "string" ? body.client_id : undefined,
				pendingState:
					typeof body.pending_state === "string"
						? body.pending_state
						: undefined,
				ip: getClientIp(req),
				userAgent: getUserAgent(req),
				deviceId: deviceCtx.deviceId,
				platform: deviceCtx.platform,
			});
			setSessionCookie(res, kit, result.sessionToken, result.csrfToken);
			if (result.redirectUrl) {
				res.redirect(result.redirectUrl);
				return;
			}
			res.json({ success: true, user_id: result.userId });
		} catch (error) {
			next(error);
		}
	});

	router.post("/email/magic/start", async (req, res, next) => {
		try {
			const body = req.body as Record<string, unknown>;
			const email = body.email;
			if (typeof email !== "string") {
				res.status(400).json({ error: "invalid_request" });
				return;
			}
			await startMagicLink(kit, {
				email,
				clientId:
					typeof body.client_id === "string" ? body.client_id : undefined,
				redirectUri:
					typeof body.redirect_uri === "string" ? body.redirect_uri : undefined,
				state: typeof body.state === "string" ? body.state : undefined,
				codeChallenge:
					typeof body.code_challenge === "string"
						? body.code_challenge
						: undefined,
				codeChallengeMethod:
					body.code_challenge_method === "S256" ? "S256" : undefined,
			});
			res.json({ success: true });
		} catch (error) {
			next(error);
		}
	});

	router.get("/email/magic/callback", async (req, res, next) => {
		try {
			const token = req.query.token;
			if (typeof token !== "string") {
				res.status(400).json({ error: "invalid_request" });
				return;
			}
			const result = await consumeMagicLink(kit, {
				token,
				ip: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			setSessionCookie(res, kit, result.sessionToken, result.csrfToken);
			res.redirect(result.redirectUrl);
		} catch (error) {
			next(error);
		}
	});

	router.get("/session", async (req, res, next) => {
		try {
			const sessionToken = getSessionToken(req, kit);
			if (!sessionToken) {
				sendUnauthorized(res);
				return;
			}
			const session = await kit.sessions.requireSessionByToken(sessionToken);
			const user = await kit.users.findById(session.userId);
			res.json({ session, user });
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/session/revoke",
		csrfMiddleware(kit),
		async (req, res, next) => {
			try {
				const sessionToken = getSessionToken(req, kit);
				if (!sessionToken) {
					sendUnauthorized(res);
					return;
				}
				const session = await kit.sessions.requireSessionByToken(sessionToken);
				await kit.sessions.revokeSession(session.id);
				await kit.config.hooks.onLogout?.(session.userId, session.id);
				clearSessionCookies(res, kit);
				res.json({ success: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post("/devices/register", async (req, res, next) => {
		try {
			const device = await handleDeviceRegister(
				kit,
				req.body as Record<string, unknown>,
				{ ip: getClientIp(req), userAgent: getUserAgent(req) },
			);
			res.status(201).json({ device });
		} catch (error) {
			next(error);
		}
	});

	router.get("/devices", async (req, res, next) => {
		try {
			const userId = await resolveAuthenticatedUserId(req, kit);
			if (!userId) {
				sendUnauthorized(res);
				return;
			}
			const devices = await handleDeviceList(kit, userId);
			res.json({ devices });
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/devices/revoke",
		csrfMiddleware(kit),
		async (req, res, next) => {
			try {
				const userId = await resolveAuthenticatedUserId(req, kit);
				if (!userId) {
					sendUnauthorized(res);
					return;
				}
				await handleDeviceRevoke(
					kit,
					userId,
					req.body as Record<string, unknown>,
				);
				res.json({ success: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.use(
		(error: unknown, _req: Request, res: Response, _next: NextFunction) => {
			sendError(res, error);
		},
	);

	return router;
}
