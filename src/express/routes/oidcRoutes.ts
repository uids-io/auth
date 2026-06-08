import type { Router } from "express";
import { normalizeIssuer } from "../../issuerUrl.js";
import { getOpenIdConfiguration } from "../../oidc/discovery.js";
import { getJwks } from "../../oidc/jwks.js";
import { getAuthProviders } from "../../oidc/providers.js";
import { renderLoginPage } from "../helpers.js";
import { asyncRouteHandler } from "../middleware/asyncRouteHandler.js";
import { validateQuery } from "../middleware/validationMiddleware.js";
import type { AuthRouterContext } from "../routerContext.js";
import { loginQuerySchema } from "../validation/oidcValidation.js";

export function registerOidcRoutes(
	router: Router,
	context: AuthRouterContext,
): void {
	router.get("/.well-known/openid-configuration", (_req, res) => {
		res.json(getOpenIdConfiguration(context.kit));
	});

	router.get("/.well-known/oauth-providers", (_req, res) => {
		res.json(getAuthProviders(context.kit));
	});

	router.get(
		"/.well-known/jwks.json",
		asyncRouteHandler(async (_req, res) => {
			res.json(await getJwks(context.kit));
		}),
	);

	router.get("/login", validateQuery(loginQuerySchema), (req, res) => {
		res.type("html").send(
			renderLoginPage({
				issuer: normalizeIssuer(context.kit.config.issuer),
				state: req.query.state as string | undefined,
				googleEnabled: !!context.kit.config.providers.google,
				microsoftEnabled: !!context.kit.config.providers.microsoft,
				emailEnabled: true,
			}),
		);
	});
}
