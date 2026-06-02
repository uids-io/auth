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

export const refreshBodySchema = z.object({
	refresh_token: z.string(),
});

export const logoutBodySchema = z
	.object({
		refresh_token: z.string().optional(),
	})
	.passthrough();
