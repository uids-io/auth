import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { AuthKit } from "../config.js";
import { isAuthError } from "../errors.js";
import { DEVICE_ID_HEADER } from "../types.js";
import { parseCookies } from "./helpers.js";
import { createAuthRouterContext } from "./routerContext.js";
import { registerDeviceRoutes } from "./routes/deviceRoutes.js";
import { registerEmailRoutes } from "./routes/emailRoutes.js";
import { registerOauthRoutes } from "./routes/oauthRoutes.js";
import { registerOidcRoutes } from "./routes/oidcRoutes.js";
import { registerSessionRoutes } from "./routes/sessionRoutes.js";

function validateCsrf(req: Request): boolean {
	const cookies = req.cookies ?? parseCookies(req.headers.cookie);
	const header = req.headers["x-csrf-token"];
	const cookie = cookies.uids_csrf;

	if (typeof header !== "string" || typeof cookie !== "string") {
		return false;
	}

	return header === cookie;
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
		const cookies = req.cookies ?? parseCookies(req.headers.cookie);
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
	const context = createAuthRouterContext(kit);
	router.use(corsMiddleware(kit));
	const csrfProtection = csrfMiddleware(kit);

	registerOidcRoutes(router, context);
	registerOauthRoutes(router, context, csrfProtection);
	registerEmailRoutes(router, context);
	registerSessionRoutes(router, context, csrfProtection);
	registerDeviceRoutes(router, context, csrfProtection);

	router.use(
		(error: unknown, _req: Request, res: Response, _next: NextFunction) => {
			sendError(res, error);
		},
	);

	return router;
}
