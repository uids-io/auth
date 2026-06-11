import type { NextFunction, Request, Response } from "express";
import type { AuthKit } from "../../config.js";
import { TOKEN_DELIVERY_HEADER } from "../../oauth/refreshCookie.js";
import { DEVICE_ID_HEADER } from "../../types.js";

export function createCorsMiddleware(kit: AuthKit) {
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
					[
						"Content-Type",
						"Authorization",
						"X-CSRF-Token",
						DEVICE_ID_HEADER,
						TOKEN_DELIVERY_HEADER,
					].join(", "),
				);
				res.setHeader(
					"Access-Control-Allow-Methods",
					"GET, POST, PUT, PATCH, DELETE, OPTIONS",
				);
				// Embedded email/password login reads `Location` with `redirect: "manual"`.
				res.setHeader("Access-Control-Expose-Headers", "Location");
			}
		}

		if (req.method === "OPTIONS") {
			res.status(204).end();
			return;
		}

		next();
	};
}
