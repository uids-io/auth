import type { RequestHandler, Router } from "express";
import {
	handleDeviceList,
	handleDeviceRegister,
	handleDeviceRevoke,
} from "../../devices/handlers.js";
import { getClientIp, getUserAgent } from "../helpers.js";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler.js";
import { validateBody } from "../middleware/validationMiddleware.js";
import type { AuthRouterContext } from "../routerContext.js";
import {
	deviceRegisterBodySchema,
	deviceRevokeBodySchema,
} from "../validation/deviceValidation.js";

export function registerDeviceRoutes(
	router: Router,
	context: AuthRouterContext,
	csrfBypassMiddleware: RequestHandler,
	csrfMiddleware: RequestHandler,
): void {
	router.post(
		"/devices/register",
		validateBody(deviceRegisterBodySchema),
		asyncRouteHandler(async (req, res) => {
			const device = await handleDeviceRegister(
				context.kit,
				req.body as Record<string, unknown>,
				{ ip: getClientIp(req), userAgent: getUserAgent(req) },
			);

			res.status(201).json({ device });
		}),
	);

	router.get(
		"/devices",
		asyncRouteHandler(async (req, res) => {
			const userId = await context.resolveAuthenticatedUserId(req);

			if (!userId) {
				context.sendUnauthorized(res);
				return;
			}

			const devices = await handleDeviceList(context.kit, userId);

			res.json({ devices });
		}),
	);

	router.post(
		"/devices/revoke",
		csrfBypassMiddleware,
		csrfMiddleware,
		validateBody(deviceRevokeBodySchema),
		asyncRouteHandler(async (req, res) => {
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
		}),
	);
}
