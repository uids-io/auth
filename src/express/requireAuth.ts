import type { NextFunction, Request, RequestHandler, Response } from "express";
import { isAuthError, UnauthorizedError } from "../errors.js";
import { verifyAccessToken } from "../services/TokenService.js";
import type { AuthContext, DevicePlatform } from "../types.js";

export interface RequireAuthConfig {
	issuer: string;
	audience: string;
	jwksUrl?: string;
	localJwks?: import("jose").JWK[];
}

declare global {
	namespace Express {
		interface Request {
			auth?: AuthContext;
		}
	}
}

export function requireAuth(config: RequireAuthConfig): RequestHandler {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		try {
			const authHeader = req.headers.authorization;
			if (!authHeader?.startsWith("Bearer ")) {
				throw new UnauthorizedError("Missing Bearer token", "missing_token");
			}

			const token = authHeader.slice(7);
			const claims = await verifyAccessToken({
				token,
				issuer: config.issuer,
				audience: config.audience,
				jwksUrl: config.jwksUrl,
				localJwks: config.localJwks,
			});

			const scopes = claims.scope
				? claims.scope.split(/\s+/).filter(Boolean)
				: [];

			req.auth = {
				userId: Number(claims.sub),
				clientId: claims.client_id,
				scopes,
				email: claims.email,
				emailVerified: claims.email_verified,
				deviceId: claims.device_id,
				platform: claims.platform as DevicePlatform | undefined,
			};

			next();
		} catch (error) {
			if (isAuthError(error)) {
				res.status(error.statusCode).json({
					error: error.code,
					error_description: error.message,
				});
				return;
			}
			res.status(401).json({
				error: "invalid_token",
				error_description: "Token validation failed",
			});
		}
	};
}
