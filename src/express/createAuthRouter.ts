import type { Router } from "express";
import { Router as createRouter } from "express";
import type { AuthKit } from "../config.js";
import { createCorsMiddleware } from "./middleware/corsMiddleware.js";
import { createCsrfBypassMiddleware } from "./middleware/csrfBypassMiddleware.js";
import { createCsrfMiddleware } from "./middleware/csrfMiddleware.js";
import { createErrorMiddleware } from "./middleware/errorMiddleware.js";
import { createAuthRouterContext } from "./routerContext.js";
import { registerDeviceRoutes } from "./routes/deviceRoutes.js";
import { registerEmailRoutes } from "./routes/emailRoutes.js";
import { registerOauthRoutes } from "./routes/oauthRoutes.js";
import { registerOidcRoutes } from "./routes/oidcRoutes.js";
import { registerSessionRoutes } from "./routes/sessionRoutes.js";

export function createAuthRouter(kit: AuthKit): Router {
	const router = createRouter();
	const context = createAuthRouterContext(kit);
	router.use(createCorsMiddleware(kit));
	const csrfProtection = createCsrfMiddleware(kit);
	const csrfBypassMiddleware = createCsrfBypassMiddleware(kit);

	registerOidcRoutes(router, context);
	registerOauthRoutes(router, context, csrfBypassMiddleware, csrfProtection);
	registerEmailRoutes(router, context);
	registerSessionRoutes(router, context, csrfBypassMiddleware, csrfProtection);
	registerDeviceRoutes(router, context, csrfBypassMiddleware, csrfProtection);

	router.use(createErrorMiddleware());

	return router;
}
