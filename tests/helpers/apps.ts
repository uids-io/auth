import express from "express";
import { createAuthRouter } from "../../src/express/createAuthRouter.js";
import { requireAuth } from "../../src/express/requireAuth.js";
import type { AuthKit } from "../../src/config.js";

export function createAuthTestApp(kit: AuthKit): express.Application {
	const authApp = express();
	authApp.use(express.json());
	authApp.use(createAuthRouter(kit));
	return authApp;
}

export async function createProtectedApiTestApp(
	kit: AuthKit,
): Promise<express.Application> {
	const jwks = await kit.tokens.getPublicJwks();
	const apiApp = express();
	apiApp.use(express.json());
	apiApp.use(
		requireAuth({
			issuer: kit.config.issuer,
			audience: kit.config.apiAudience,
			localJwks: jwks.keys,
		}),
	);
	apiApp.get("/me", (req, res) => {
		res.json({ auth: req.auth });
	});
	return apiApp;
}
