export class AuthError extends Error {
	readonly code: string;
	readonly statusCode: number;

	constructor(message: string, code: string, statusCode = 500) {
		super(message);
		this.name = "AuthError";
		this.code = code;
		this.statusCode = statusCode;
	}
}

export interface ValidationDetail {
	field: string;
	message: string;
}

export class InvalidRequestError extends AuthError {
	constructor(message: string, code = "invalid_request") {
		super(message, code, 400);
		this.name = "InvalidRequestError";
	}
}

export class ValidationError extends AuthError {
	readonly details: ValidationDetail[];

	constructor(
		message: string,
		details: ValidationDetail[],
		code = "VALIDATION_ERROR",
	) {
		super(message, code, 422);
		this.name = "ValidationError";
		this.details = details;
	}
}

export class UnauthorizedError extends AuthError {
	constructor(message: string, code = "unauthorized") {
		super(message, code, 401);
		this.name = "UnauthorizedError";
	}
}

export class ForbiddenError extends AuthError {
	constructor(message: string, code = "forbidden") {
		super(message, code, 403);
		this.name = "ForbiddenError";
	}
}

export class ConflictError extends AuthError {
	constructor(message: string, code = "conflict") {
		super(message, code, 409);
		this.name = "ConflictError";
	}
}

export class RateLimitError extends AuthError {
	readonly retryAfterSeconds?: number;

	constructor(message: string, retryAfterSeconds?: number) {
		super(message, "rate_limit_exceeded", 429);
		this.name = "RateLimitError";
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

export class InternalServerError extends AuthError {
	constructor(message: string, code = "internal_server_error") {
		super(message, code, 500);
		this.name = "InternalServerError";
	}
}

export function isAuthError(error: unknown): error is AuthError {
	return error instanceof AuthError;
}

export function isValidationError(error: unknown): error is ValidationError {
	return error instanceof ValidationError;
}
