import type { Pool } from "pg";
import { z } from "zod";
import { createPool, isPoolOwned } from "./db/pool.js";
import { AuthService } from "./services/AuthService.js";
import { DeviceService } from "./services/DeviceService.js";
import { OAuthClientService } from "./services/OAuthClientService.js";
import { SessionService } from "./services/SessionService.js";
import { TokenService } from "./services/TokenService.js";
import { UserService } from "./services/UserService.js";
import type {
	AuthUser,
	Device,
	DevicePlatform,
	RateLimiter,
	SameSiteOption,
} from "./types.js";

const providerSchema = z.object({
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
	callbackUrl: z.string().url(),
});

const microsoftProviderSchema = providerSchema.extend({
	tenant: z.string().min(1).default("common"),
});

const cookieSchema = z.object({
	name: z.string().min(1).default("uids_auth_session"),
	domain: z.string().optional(),
	secure: z.boolean().default(true),
	sameSite: z.enum(["strict", "lax", "none"]).default("lax"),
});

const providersSchema = z
	.object({
		google: providerSchema.optional(),
		microsoft: microsoftProviderSchema.optional(),
	})
	.default({});

const tokenSchema = z
	.object({
		accessTokenTtlSeconds: z.number().int().positive().default(900),
		refreshTokenTtlSeconds: z.number().int().positive().default(2592000),
	})
	.default({});

const emailSchema = z
	.object({
		sendMagicLink: z
			.function()
			.args(z.string(), z.string())
			.returns(z.promise(z.void()))
			.optional(),
	})
	.default({});

const hooksSchema = z
	.object({
		onUserCreated: z
			.function()
			.args(z.custom<AuthUser>())
			.returns(z.promise(z.void()))
			.optional(),
		onLogin: z
			.function()
			.args(z.custom<AuthUser>(), z.string())
			.returns(z.promise(z.void()))
			.optional(),
		onLogout: z
			.function()
			.args(z.number(), z.number())
			.returns(z.promise(z.void()))
			.optional(),
		onDeviceRegistered: z
			.function()
			.args(
				z.object({
					device: z.custom<Device>(),
					clientId: z.string(),
					userId: z.number().optional(),
				}),
			)
			.returns(z.promise(z.void()))
			.optional(),
		resolvePostLoginRedirect: z
			.function()
			.args(
				z.object({
					clientId: z.string(),
					redirectUri: z.string(),
					state: z.string().optional(),
				}),
			)
			.returns(z.promise(z.string().optional()))
			.optional(),
	})
	.default({});

const accountLinkingSchema = z
	.object({
		autoLinkVerifiedEmail: z.boolean().default(true),
		blockUnverifiedEmailLinking: z.boolean().default(true),
	})
	.default({});

const devicesSchema = z
	.object({
		requireDeviceId: z.boolean().default(false),
		bindOnRegister: z.boolean().default(true),
		includeInAccessToken: z.boolean().default(true),
	})
	.default({});

const signingKeysSchema = z
	.object({
		mode: z.enum(["dev-plaintext", "encrypted"]).default("dev-plaintext"),
		encryptionKey: z.string().optional(),
	})
	.default({ mode: "dev-plaintext" });

const authConfigSchema = z.object({
	issuer: z.string().url(),
	apiAudience: z.string().min(1),
	pg: z.custom<Pool | string>(),
	cookie: cookieSchema,
	providers: providersSchema,
	token: tokenSchema,
	email: emailSchema,
	hooks: hooksSchema,
	accountLinking: accountLinkingSchema,
	devices: devicesSchema,
	globalAllowedOrigins: z.array(z.string()).default([]),
	rateLimiter: z.custom<RateLimiter>().optional(),
	csrf: z.object({ secret: z.string().min(16) }).optional(),
	signingKeys: signingKeysSchema,
});

export type AuthConfigInput = z.input<typeof authConfigSchema>;
export type AuthConfig = z.output<typeof authConfigSchema>;

export interface AuthKit {
	config: AuthConfig;
	pool: Pool;
	ownsPool: boolean;
	users: UserService;
	oauthClients: OAuthClientService;
	devices: DeviceService;
	sessions: SessionService;
	tokens: TokenService;
	auth: AuthService;
}

export async function createAuthKit(input: AuthConfigInput): Promise<AuthKit> {
	const config = authConfigSchema.parse(input);
	const pool = createPool(config.pg);
	const ownsPool = isPoolOwned(config.pg);

	const users = new UserService(pool, config);
	const oauthClients = new OAuthClientService(pool);
	const devices = new DeviceService(pool, config);
	const sessions = new SessionService(pool, config);
	const tokens = new TokenService(pool, config, sessions);
	const auth = new AuthService(pool, config, users, devices, sessions, tokens);

	await tokens.ensureSigningKey();

	return {
		config,
		pool,
		ownsPool,
		users,
		oauthClients,
		devices,
		sessions,
		tokens,
		auth,
	};
}

export type { DevicePlatform, SameSiteOption };
