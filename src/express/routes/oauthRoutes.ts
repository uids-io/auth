import type { RequestHandler, Router } from "express";
import { getClientIp, getUserAgent } from "../helpers.js";
import type { AuthRouterContext } from "../routerContext.js";
import { handleAuthorize } from "../../oauth/authorize.js";
import {
	handleSocialCallback,
	type SocialProvider,
	startSocialLogin,
} from "../../oauth/callback.js";
import { handleLogout } from "../../oauth/logout.js";
import { handleRefresh } from "../../oauth/refresh.js";
import { handleTokenExchange } from "../../oauth/token.js";
import { parseDeviceContext } from "../../types.js";

function registerSocialProviderRoutes(
	router: Router,
	context: AuthRouterContext,
	provider: SocialProvider,
): void {
	router.get(`/oauth/${provider}/start`, async (req, res, next) => {
		try {
			const state = context.getQueryStringParam(req.query.state);
			const url = await startSocialLogin(context.kit, provider, {
				pendingState: state,
			});
			res.redirect(url);
		} catch (error) {
			next(error);
		}
	});

	router.get(`/oauth/${provider}/callback`, async (req, res, next) => {
		try {
			const code = context.getQueryStringParam(req.query.code);
			const state = context.getQueryStringParam(req.query.state);
			if (!code || !state) {
				res.status(400).json({ error: "invalid_request" });
				return;
			}
			const result = await handleSocialCallback(context.kit, provider, {
				code,
				state,
				ip: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			const session = await context.kit.sessions.createSession({
				userId: result.userId,
			});
			context.setSessionCookie(res, session.sessionToken, session.csrfToken);
			res.redirect(result.redirectUrl);
		} catch (error) {
			next(error);
		}
	});
}

export function registerOauthRoutes(
	router: Router,
	context: AuthRouterContext,
	csrfMiddleware: RequestHandler,
): void {
	router.get("/authorize", async (req, res, next) => {
		try {
			const deviceCtx = parseDeviceContext(
				req.headers as Record<string, string | string[] | undefined>,
				undefined,
				req.query as Record<string, unknown>,
			);
			const result = await handleAuthorize(context.kit, {
				query: req.query as Record<string, unknown>,
				sessionToken: context.getSessionToken(req),
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
				context.kit,
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
				context.kit,
				req.body as Record<string, unknown>,
			);
			res.json(tokens);
		} catch (error) {
			next(error);
		}
	});

	router.post("/logout", csrfMiddleware, async (req, res, next) => {
		try {
			await handleLogout(context.kit, {
				sessionToken: context.getSessionToken(req),
				refreshToken:
					typeof req.body?.refresh_token === "string"
						? req.body.refresh_token
						: undefined,
			});
			context.clearSessionCookies(res);
			res.json({ success: true });
		} catch (error) {
			next(error);
		}
	});

	registerSocialProviderRoutes(router, context, "google");
	registerSocialProviderRoutes(router, context, "microsoft");
}
