import type { Router } from "express";
import { consumeMagicLink, startMagicLink } from "../../email/magicLink.js";
import {
	loginWithPassword,
	registerWithPassword,
} from "../../email/passwordLogin.js";
import { parseDeviceContext } from "../../types.js";
import { getClientIp, getUserAgent, parseFormBody } from "../helpers.js";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler.js";
import {
	validateBody,
	validateQuery,
} from "../middleware/validationMiddleware.js";
import type { AuthRouterContext } from "../routerContext.js";
import {
	magicCallbackQuerySchema,
	magicStartBodySchema,
	passwordLoginBodySchema,
	passwordRegisterBodySchema,
} from "../validation/emailValidation.js";

export function registerEmailRoutes(
	router: Router,
	context: AuthRouterContext,
): void {
	router.post(
		"/email/password/register",
		validateBody(passwordRegisterBodySchema),
		asyncRouteHandler(async (req, res) => {
			const body = req.body as Record<string, unknown>;

			const result = await registerWithPassword(context.kit, {
				email: body.email as string,
				password: body.password as string,
				displayName:
					typeof body.display_name === "string" ? body.display_name : undefined,
			});

			res.status(201).json({ user_id: result.userId });
		}),
	);

	router.post(
		"/email/password/login",
		validateBody(passwordLoginBodySchema),
		asyncRouteHandler(async (req, res) => {
			const body = {
				...parseFormBody(req.body),
				...(req.body as object),
			} as Record<string, unknown>;

			const deviceCtx = parseDeviceContext(
				req.headers as Record<string, string | string[] | undefined>,
				body,
			);

			const result = await loginWithPassword(context.kit, {
				email: body.email as string,
				password: body.password as string,
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

			context.setSessionCookie(res, result.sessionToken, result.csrfToken);

			if (result.redirectUrl) {
				res.redirect(result.redirectUrl);
				return;
			}

			res.json({ success: true, user_id: result.userId });
		}),
	);

	router.post(
		"/email/magic/start",
		validateBody(magicStartBodySchema),
		asyncRouteHandler(async (req, res) => {
			const body = req.body as Record<string, unknown>;

			await startMagicLink(context.kit, {
				email: body.email as string,
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
		}),
	);

	router.get(
		"/email/magic/callback",
		validateQuery(magicCallbackQuerySchema),
		asyncRouteHandler(async (req, res) => {
			const result = await consumeMagicLink(context.kit, {
				token: req.query.token as string,
				ip: getClientIp(req),
				userAgent: getUserAgent(req),
			});

			context.setSessionCookie(res, result.sessionToken, result.csrfToken);

			res.redirect(result.redirectUrl);
		}),
	);
}
