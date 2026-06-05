import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthKit } from "../../config.js";
import { REFRESH_TOKEN_COOKIE_NAME } from "../../oauth/refreshCookie.js";
import { parseCookies } from "../helpers.js";

declare global {
	namespace Express {
		interface Request {
			/**
			 * When true, the CSRF middleware skips validation for this request.
			 * Set by middleware that understands when CSRF should be bypassed.
			 */
			csrfBypassed?: boolean;
		}
	}
}

const DEFAULT_REFRESH_COOKIE_BYPASS_PATHS = new Set<string>([
	"/refresh",
	"/logout",
]);

/**
 * Bypasses CSRF for selected OAuth endpoints when the refresh token is delivered
 * via HttpOnly cookie (SPA cookie delivery mode).
 */
export function createCsrfBypassMiddleware(
	kit: AuthKit,
	bypassPaths: ReadonlySet<string> = DEFAULT_REFRESH_COOKIE_BYPASS_PATHS,
): RequestHandler {
	// Keep `kit` parameter so callers can swap in a variant later.
	void kit;
	return (req: Request, _res: Response, next: NextFunction): void => {
		const cookies = req.cookies ?? parseCookies(req.headers.cookie);
		if (typeof cookies[REFRESH_TOKEN_COOKIE_NAME] !== "string") {
			next();
			return;
		}

		if (bypassPaths.has(req.path)) {
			req.csrfBypassed = true;
		}

		next();
	};
}
