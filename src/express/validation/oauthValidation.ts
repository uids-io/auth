import { z } from "zod";
import { devicePlatformSchema } from "../../types.js";

export const socialStartQuerySchema = z.object({
	state: z.string().optional(),
});

export const socialCallbackQuerySchema = z.object({
	code: z.string(),
	state: z.string(),
});

export const authorizeQuerySchema = z
	.object({
		response_type: z.string(),
		client_id: z.string(),
		redirect_uri: z.string(),
		code_challenge: z.string(),
		code_challenge_method: z.string(),
		scope: z.string().optional(),
		state: z.string().optional(),
		nonce: z.string().optional(),
		device_id: z.string().optional(),
		platform: devicePlatformSchema.optional(),
		platform_version: z.string().optional(),
		app_version: z.string().optional(),
		device_name: z.string().optional(),
	})
	.passthrough();

export const tokenBodySchema = z.object({
	grant_type: z.literal("authorization_code"),
	code: z.string(),
	client_id: z.string(),
	redirect_uri: z.string(),
	code_verifier: z.string(),
});

const refreshTokenFieldSchema = z.string().min(1);

export const refreshBodySchema = z
	.object({
		refresh_token: refreshTokenFieldSchema.optional(),
	})
	.passthrough();

/** Logout via refresh token in body — CSRF bypass; same shape as logoutBodySchema when token is sent. */
export const refreshTokenLogoutBodySchema = z.object({
	refresh_token: refreshTokenFieldSchema,
});

export const logoutBodySchema = z
	.object({
		refresh_token: refreshTokenFieldSchema.optional(),
	})
	.passthrough();

export function isRefreshTokenLogoutRequest(body: unknown): boolean {
	return refreshTokenLogoutBodySchema.safeParse(body).success;
}
