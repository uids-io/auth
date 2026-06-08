import type { RequestHandler } from "express";
import { ZodError, type ZodIssue, type ZodTypeAny } from "zod";
import { logger } from "../../config/logger.js";
import { type ValidationDetail, ValidationError } from "../../errors.js";

function formatFieldPath(
	scope: "body" | "query" | "params",
	path: PropertyKey[],
): string {
	if (path.length === 0) {
		return scope;
	}

	return path.map(String).join(".");
}

function mapZodIssues(
	scope: "body" | "query" | "params",
	issues: ZodIssue[],
): ValidationDetail[] {
	return issues.map((issue) => ({
		field: formatFieldPath(scope, issue.path),
		message: issue.message,
	}));
}

function createValidator(
	scope: "body" | "query" | "params",
	schema: ZodTypeAny,
): RequestHandler {
	return (req, _res, next): void => {
		try {
			const input =
				scope === "body"
					? req.body
					: scope === "query"
						? req.query
						: req.params;

			schema.parse(input);

			next();
		} catch (error) {
			if (error instanceof ZodError) {
				const details = mapZodIssues(scope, error.issues);
				logger.warn(
					{
						validationScope: scope,
						issueCount: details.length,
						fields: details.map((d) => d.field),
					},
					"Request validation failed",
				);

				next(
					new ValidationError("Validation failed", details, "VALIDATION_ERROR"),
				);

				return;
			}
			next(error);
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
