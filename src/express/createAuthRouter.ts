import type { NextFunction, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { AuthKit } from "../config.js";
import { isAuthError } from "../errors.js";
import { createCorsMiddleware } from "./middleware/corsMiddleware.js";
import { createCsrfMiddleware } from "./middleware/csrfMiddleware.js";
import { createAuthRouterContext } from "./routerContext.js";
import { registerDeviceRoutes } from "./routes/deviceRoutes.js";
import { registerEmailRoutes } from "./routes/emailRoutes.js";
import { registerOauthRoutes } from "./routes/oauthRoutes.js";
import { registerOidcRoutes } from "./routes/oidcRoutes.js";
import { registerSessionRoutes } from "./routes/sessionRoutes.js";

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

export function createAuthRouter(kit: AuthKit): Router {
	const router = createRouter();
	const context = createAuthRouterContext(kit);
	router.use(createCorsMiddleware(kit));
	const csrfProtection = createCsrfMiddleware(kit);

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
