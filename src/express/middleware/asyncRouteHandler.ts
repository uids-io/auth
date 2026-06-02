import type { RequestHandler } from "express";

export function asyncRouteHandler(handler: RequestHandler): RequestHandler {
	return (req, res, next) => {
		void Promise.resolve(handler(req, res, next)).catch(next);
	};
}
