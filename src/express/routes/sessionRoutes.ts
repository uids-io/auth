import type { RequestHandler, Router } from "express";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler.js";
import type { AuthRouterContext } from "../routerContext.js";

export function registerSessionRoutes(
	router: Router,
	context: AuthRouterContext,
	csrfMiddleware: RequestHandler,
): void {
	router.get(
		"/session",
		asyncRouteHandler(async (req, res) => {
			const sessionToken = context.getSessionToken(req);

			if (!sessionToken) {
				context.sendUnauthorized(res);
				return;
			}

			const session =
				await context.kit.sessions.requireSessionByToken(sessionToken);
			const user = await context.kit.users.findById(session.userId);

			res.json({ session, user });
		}),
	);

	router.post(
		"/session/revoke",
		csrfMiddleware,
		asyncRouteHandler(async (req, res) => {
			const sessionToken = context.getSessionToken(req);

			if (!sessionToken) {
				context.sendUnauthorized(res);
				return;
			}

			const session =
				await context.kit.sessions.requireSessionByToken(sessionToken);
			await context.kit.sessions.revokeSession(session.id);
			await context.kit.config.hooks.onLogout?.(session.userId, session.id);
			context.clearSessionCookies(res);
      
			res.json({ success: true });
		}),
	);
}
