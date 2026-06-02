import type { RequestHandler, Router } from "express";
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
import { getClientIp, getUserAgent } from "../helpers.js";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler.js";
import type { AuthRouterContext } from "../routerContext.js";

function registerSocialProviderRoutes(
	router: Router,
	context: AuthRouterContext,
	provider: SocialProvider,
): void {
	router.get(
		`/oauth/${provider}/start`,
		asyncRouteHandler(async (req, res) => {
			const state = context.getQueryStringParam(req.query.state);
			const url = await startSocialLogin(context.kit, provider, {
				pendingState: state,
			});

			res.redirect(url);
		}),
	);

	router.get(
		`/oauth/${provider}/callback`,
		asyncRouteHandler(async (req, res) => {
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
		}),
	);
}

export function registerOauthRoutes(
	router: Router,
	context: AuthRouterContext,
	csrfMiddleware: RequestHandler,
): void {
	router.get(
		"/authorize",
		asyncRouteHandler(async (req, res) => {
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
		}),
	);

	router.post(
		"/token",
		asyncRouteHandler(async (req, res) => {
			const tokens = await handleTokenExchange(
				context.kit,
				req.body as Record<string, unknown>,
			);
			res.json(tokens);
		}),
	);

	router.post(
		"/refresh",
		asyncRouteHandler(async (req, res) => {
			const tokens = await handleRefresh(
				context.kit,
				req.body as Record<string, unknown>,
			);
			res.json(tokens);
		}),
	);

	router.post(
		"/logout",
		csrfMiddleware,
		asyncRouteHandler(async (req, res) => {
			await handleLogout(context.kit, {
				sessionToken: context.getSessionToken(req),
				refreshToken:
					typeof req.body?.refresh_token === "string"
						? req.body.refresh_token
						: undefined,
			});
			context.clearSessionCookies(res);
			res.json({ success: true });
		}),
	);

	registerSocialProviderRoutes(router, context, "google");
	registerSocialProviderRoutes(router, context, "microsoft");
}
