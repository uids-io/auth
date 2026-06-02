import type { RequestHandler, Router } from "express";
import {
	handleDeviceList,
	handleDeviceRegister,
	handleDeviceRevoke,
} from "../../devices/handlers.js";
import { getClientIp, getUserAgent } from "../helpers.js";
import type { AuthRouterContext } from "../routerContext.js";

export function registerDeviceRoutes(
	router: Router,
	context: AuthRouterContext,
	csrfMiddleware: RequestHandler,
): void {
	router.post("/devices/register", async (req, res, next) => {
		try {
			const device = await handleDeviceRegister(
				context.kit,
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
			const userId = await context.resolveAuthenticatedUserId(req);
			if (!userId) {
				context.sendUnauthorized(res);
				return;
			}
			const devices = await handleDeviceList(context.kit, userId);
			res.json({ devices });
		} catch (error) {
			next(error);
		}
	});

	router.post("/devices/revoke", csrfMiddleware, async (req, res, next) => {
		try {
			const userId = await context.resolveAuthenticatedUserId(req);
			if (!userId) {
				context.sendUnauthorized(res);
				return;
			}
			await handleDeviceRevoke(
				context.kit,
				userId,
				req.body as Record<string, unknown>,
			);
			res.json({ success: true });
		} catch (error) {
			next(error);
		}
	});
}
