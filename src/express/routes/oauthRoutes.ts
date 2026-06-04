import type { RequestHandler, Router } from "express";
import { handleAuthorize } from "../../oauth/authorize.js";
import {
	handleSocialCallback,
	type SocialProvider,
	startSocialLogin,
} from "../../oauth/callback.js";
import { handleLogout } from "../../oauth/logout.js";
import { handleRefresh } from "../../oauth/refresh.js";
import {
	clearRefreshTokenCookie,
	setRefreshTokenCookie,
	stripRefreshFromJson,
	wantsCookieTokenDelivery,
} from "../../oauth/refreshCookie.js";
import { handleTokenExchange } from "../../oauth/token.js";
import { parseDeviceContext } from "../../types.js";
import { getClientIp, getUserAgent, parseCookies } from "../helpers.js";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler.js";
import {
	validateBody,
	validateQuery,
} from "../middleware/validationMiddleware.js";
import type { AuthRouterContext } from "../routerContext.js";
import {
	authorizeQuerySchema,
	logoutBodySchema,
	refreshBodySchema,
	socialCallbackQuerySchema,
	socialStartQuerySchema,
	tokenBodySchema,
} from "../validation/oauthValidation.js";

function registerSocialProviderRoutes(
	router: Router,
	context: AuthRouterContext,
	provider: SocialProvider,
): void {
	router.get(
		`/oauth/${provider}/start`,
		validateQuery(socialStartQuerySchema),
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
		validateQuery(socialCallbackQuerySchema),
		asyncRouteHandler(async (req, res) => {
			const code = req.query.code as string;
			const state = req.query.state as string;

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
		validateQuery(authorizeQuerySchema),
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
		validateBody(tokenBodySchema),
		asyncRouteHandler(async (req, res) => {
			let tokens = await handleTokenExchange(
				context.kit,
				req.body as Record<string, unknown>,
			);

			if (wantsCookieTokenDelivery(req.headers) && tokens.refresh_token) {
				setRefreshTokenCookie(context.kit, res, tokens.refresh_token);
				tokens = stripRefreshFromJson(tokens);
			}

			res.json(tokens);
		}),
	);

	router.post(
		"/refresh",
		validateBody(refreshBodySchema),
		asyncRouteHandler(async (req, res) => {
			let tokens = await handleRefresh(context.kit, {
				body: req.body as Record<string, unknown>,
				headers: { cookie: req.headers.cookie },
			});

			if (wantsCookieTokenDelivery(req.headers) && tokens.refresh_token) {
				setRefreshTokenCookie(context.kit, res, tokens.refresh_token);
				tokens = stripRefreshFromJson(tokens);
			}

			res.json(tokens);
		}),
	);

	router.post(
		"/logout",
		csrfMiddleware,
		validateBody(logoutBodySchema),
		asyncRouteHandler(async (req, res) => {
			const cookies = parseCookies(req.headers.cookie);
			const refreshFromCookie = cookies.uids_refresh_token;
			await handleLogout(context.kit, {
				sessionToken: context.getSessionToken(req),
				refreshToken:
					typeof req.body.refresh_token === "string"
						? req.body.refresh_token
						: typeof refreshFromCookie === "string"
							? refreshFromCookie
							: undefined,
			});

			context.clearSessionCookies(res);
			clearRefreshTokenCookie(context.kit, res);

			res.json({ success: true });
		}),
	);

	registerSocialProviderRoutes(router, context, "google");
	registerSocialProviderRoutes(router, context, "microsoft");
}
