import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { InvalidRequestError } from "../../errors.js";

function formatValidationErrorMessage(
	scope: "body" | "query" | "params",
	error: unknown,
): string {
	if (
		error &&
		typeof error === "object" &&
		"issues" in error &&
		Array.isArray((error as { issues?: unknown[] }).issues)
	) {
		const firstIssue = (error as { issues: Array<{ message?: string }> }).issues[0];

		if (firstIssue?.message) {
			return `Invalid ${scope}: ${firstIssue.message}`;
		}
	}

	return `Invalid ${scope}`;
}

function createValidator(
	scope: "body" | "query" | "params",
	schema: ZodTypeAny,
): RequestHandler {
	return (req, _res, next): void => {
		try {
			const input =
				scope === "body" ? req.body : scope === "query" ? req.query : req.params;
			const parsed = schema.parse(input);

			if (scope === "body") {
				req.body = parsed;
			} else if (scope === "query") {
				req.query = parsed;
			} else {
				req.params = parsed;
			}
      
			next();
		} catch (error) {
			next(
				new InvalidRequestError(formatValidationErrorMessage(scope, error)),
			);
		}
	};
}

export function validateBody(schema: ZodTypeAny): RequestHandler {
	return createValidator("body", schema);
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
	return createValidator("query", schema);
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
	return createValidator("params", schema);
}
