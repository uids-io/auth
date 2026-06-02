import type { NextFunction, Request, Response } from "express";
import type { AuthKit } from "../../config.js";
import { parseCookies } from "../helpers.js";

function validateCsrf(req: Request): boolean {
	const cookies = req.cookies ?? parseCookies(req.headers.cookie);
	const header = req.headers["x-csrf-token"];
	const cookie = cookies.uids_csrf;

	if (typeof header !== "string" || typeof cookie !== "string") {
		return false;
	}

	return header === cookie;
}

export function createCsrfMiddleware(kit: AuthKit) {
	return (req: Request, res: Response, next: NextFunction): void => {
		if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
			next();
			return;
		}

		const cookies = req.cookies ?? parseCookies(req.headers.cookie);
		const hasSession = Boolean(cookies[kit.config.cookie.name]);

		if (hasSession && cookies.uids_csrf && !validateCsrf(req)) {
			res.status(403).json({
				error: "csrf_failed",
				error_description: "CSRF validation failed",
			});
			return;
		}

		next();
	};
}
