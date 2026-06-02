import type { Router } from "express";
import { getOpenIdConfiguration } from "../../oidc/discovery.js";
import { getJwks } from "../../oidc/jwks.js";
import { renderLoginPage } from "../helpers.js";
import type { AuthRouterContext } from "../routerContext.js";

export function registerOidcRoutes(
	router: Router,
	context: AuthRouterContext,
): void {
	router.get("/.well-known/openid-configuration", (_req, res) => {
		res.json(getOpenIdConfiguration(context.kit));
	});

	router.get("/.well-known/jwks.json", async (_req, res, next) => {
		try {
			res.json(await getJwks(context.kit));
		} catch (error) {
			next(error);
		}
	});

	router.get("/login", (req, res) => {
		res.type("html").send(
			renderLoginPage({
				issuer: context.kit.config.issuer.replace(/\/$/, ""),
				state:
					typeof req.query.state === "string" ? req.query.state : undefined,
				googleEnabled: !!context.kit.config.providers.google,
				microsoftEnabled: !!context.kit.config.providers.microsoft,
				emailEnabled: true,
			}),
		);
	});
}
