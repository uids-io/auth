import { z } from "zod";
import { devicePlatformSchema } from "../../types.js";

export const deviceRegisterBodySchema = z.object({
	client_id: z.string(),
	device_id: z.string(),
	platform: devicePlatformSchema,
	platform_version: z.string().optional(),
	app_version: z.string().optional(),
	device_name: z.string().optional(),
});

export const deviceRevokeBodySchema = z.object({
	device_id: z.string(),
});
