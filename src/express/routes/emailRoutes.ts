import type { Router } from "express";
import { consumeMagicLink, startMagicLink } from "../../email/magicLink.js";
import {
	loginWithPassword,
	registerWithPassword,
} from "../../email/passwordLogin.js";
import { getClientIp, getUserAgent, parseFormBody } from "../helpers.js";
import type { AuthRouterContext } from "../routerContext.js";
import { parseDeviceContext } from "../../types.js";

export function registerEmailRoutes(
	router: Router,
	context: AuthRouterContext,
): void {
	router.post("/email/password/register", async (req, res, next) => {
		try {
			const body = req.body as Record<string, unknown>;
			const email = body.email;
			const password = body.password;
			if (typeof email !== "string" || typeof password !== "string") {
				res.status(400).json({ error: "invalid_request" });
				return;
			}
			const result = await registerWithPassword(context.kit, {
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
			const result = await loginWithPassword(context.kit, {
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
			context.setSessionCookie(res, result.sessionToken, result.csrfToken);
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
			await startMagicLink(context.kit, {
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
			const result = await consumeMagicLink(context.kit, {
				token,
				ip: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			context.setSessionCookie(res, result.sessionToken, result.csrfToken);
			res.redirect(result.redirectUrl);
		} catch (error) {
			next(error);
		}
	});
}
