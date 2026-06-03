import type { NextFunction, Request, Response } from "express";
import { logger } from "../../config/logger.js";
import {
	isAuthError,
	isValidationError,
	type ValidationError,
} from "../../errors.js";

function getRequestId(req: Request): string | undefined {
	const header = req.headers["x-request-id"];
	return typeof header === "string" ? header : undefined;
}

function sendValidationError(res: Response, error: ValidationError): void {
	res.status(error.statusCode).json({
		success: false,
		message: error.message,
		error: {
			code: error.code,
			details: error.details,
		},
	});
}

function sendAuthError(
	res: Response,
	error: import("../../errors.js").AuthError,
): void {
	const body: Record<string, unknown> = {
		error: error.code,
		error_description: error.message,
	};
	if ("retryAfterSeconds" in error && error.retryAfterSeconds) {
		res.setHeader("Retry-After", String(error.retryAfterSeconds));
	}
	res.status(error.statusCode).json(body);
}

export function createErrorMiddleware() {
	return (
		error: unknown,
		req: Request,
		res: Response,
		_next: NextFunction,
	): void => {
		const requestId = getRequestId(req);
		const logContext = {
			requestId,
			method: req.method,
			path: req.path,
		};

		if (isValidationError(error)) {
			logger.warn(
				{ ...logContext, code: error.code, issueCount: error.details.length },
				error.message,
			);
			sendValidationError(res, error);
			return;
		}

		if (isAuthError(error)) {
			logger.info(
				{ ...logContext, code: error.code, statusCode: error.statusCode },
				error.message,
			);
			sendAuthError(res, error);
			return;
		}

		logger.error(
			{
				...logContext,
				err:
					error instanceof Error
						? { name: error.name, message: error.message }
						: { message: "Unknown error" },
			},
			"Unexpected error",
		);
		res.status(500).json({
			error: "server_error",
			error_description: "Internal server error",
		});
	};
}
