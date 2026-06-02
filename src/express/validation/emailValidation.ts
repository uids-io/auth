import { z } from "zod";

export const passwordRegisterBodySchema = z.object({
	email: z.string(),
	password: z.string(),
	display_name: z.string().optional(),
});

export const passwordLoginBodySchema = z
	.object({
		email: z.string(),
		password: z.string(),
		client_id: z.string().optional(),
		pending_state: z.string().optional(),
		device_id: z.string().optional(),
		platform: z.string().optional(),
		platform_version: z.string().optional(),
		app_version: z.string().optional(),
		device_name: z.string().optional(),
	})
	.passthrough();

export const magicStartBodySchema = z.object({
	email: z.string(),
	client_id: z.string().optional(),
	redirect_uri: z.string().optional(),
	state: z.string().optional(),
	code_challenge: z.string().optional(),
	code_challenge_method: z.literal("S256").optional(),
});

export const magicCallbackQuerySchema = z.object({
	token: z.string(),
});
