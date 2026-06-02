import type { NextFunction, Request, Response } from "express";
import { isAuthError } from "../../errors.js";

export function createErrorMiddleware() {
	return (
		error: unknown,
		_req: Request,
		res: Response,
		_next: NextFunction,
	): void => {
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
	};
}
