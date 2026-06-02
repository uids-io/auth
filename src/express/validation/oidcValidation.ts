import { z } from "zod";

export const loginQuerySchema = z.object({
	state: z.string().optional(),
});
