export type UserStatus = "active" | "disabled" | "deleted";
export type SessionStatus = "active" | "revoked" | "expired";
export type DeviceStatus = "active" | "revoked";
export type DevicePlatform = "web" | "ios" | "android" | "desktop" | "unknown";
export type OAuthClientType = "public" | "confidential";
export type SameSiteOption = "strict" | "lax" | "none";
export type AuthContextType = "oauth_authorize" | "social_login" | "magic_link";
export type AuthProviders = "google" | "microsoft" | "email";
export const DEVICE_PLATFORMS = [
	"web",
	"ios",
	"android",
	"desktop",
	"unknown",
] as const;

export interface AuthUser {
	id: number;
	primaryEmail: string | null;
	displayName: string | null;
	emailVerified: boolean;
	status: UserStatus;
	createdAt: Date;
	updatedAt: Date;
}

export interface OAuthClient {
	id: string;
	name: string;
	clientType: OAuthClientType;
	allowedRedirectUris: string[];
	allowedOrigins: string[];
	allowedScopes: string[];
	accessTokenTtlSeconds: number;
	refreshTokenTtlSeconds: number;
	enabled: boolean;
}

export interface Device {
	id: number;
	deviceId: string;
	clientId: string;
	userId: number | null;
	platform: DevicePlatform;
	platformVersion: string | null;
	appVersion: string | null;
	deviceName: string | null;
	userAgent: string | null;
	lastIp: string | null;
	status: DeviceStatus;
	firstSeenAt: Date;
	lastSeenAt: Date;
	revokedAt: Date | null;
}

export interface DeviceRegistration {
	deviceId: string;
	clientId: string;
	platform: DevicePlatform;
	platformVersion?: string;
	appVersion?: string;
	deviceName?: string;
	userAgent?: string;
	ip?: string;
}

export interface AccessTokenClaims {
	iss: string;
	sub: string;
	aud: string;
	exp: number;
	iat: number;
	scope?: string;
	client_id?: string;
	email?: string;
	email_verified?: boolean;
	device_id?: string;
	platform?: DevicePlatform;
}

export interface AuthContext {
	userId: number;
	clientId?: string;
	scopes: string[];
	email?: string;
	emailVerified?: boolean;
	deviceId?: string;
	platform?: DevicePlatform;
}

export interface TokenResponse {
	access_token: string;
	token_type: "Bearer";
	expires_in: number;
	refresh_token?: string;
	id_token?: string;
	scope?: string;
}

export interface AuthorizeParams {
	responseType: string;
	clientId: string;
	redirectUri: string;
	scope: string;
	state?: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
	nonce?: string;
	deviceId?: string;
	platform?: DevicePlatform;
}

export interface PendingAuthContext {
	type: AuthContextType;
	clientId?: string;
	redirectUri?: string;
	scopes?: string[];
	state?: string;
	codeChallenge?: string;
	codeChallengeMethod?: "S256";
	nonce?: string;
	deviceId?: string;
	platform?: DevicePlatform;
	returnTo?: string;
	provider?: string;
}

export interface ProviderProfile {
	provider: AuthProviders;
	providerSubject: string;
	email?: string;
	emailVerified: boolean;
	displayName?: string;
	rawProfile: Record<string, unknown>;
}

export interface RateLimiter {
	check(key: string): Promise<RateLimiterResult>;
}

export interface RateLimiterResult {
	allowed: boolean;
	retryAfterSeconds?: number;
}

export interface SessionRecord {
	id: number;
	userId: number;
	clientId: string | null;
	deviceId: number | null;
	status: SessionStatus;
	expiresAt: Date;
}

export const DEVICE_ID_HEADER = "x-uids-device-id";

export function isDevicePlatform(value: unknown): value is DevicePlatform {
	return (
		typeof value === "string" &&
		(DEVICE_PLATFORMS as readonly string[]).includes(value)
	);
}

export function parseDeviceContext(
	headers: Record<string, string | string[] | undefined>,
	body?: Record<string, unknown>,
	query?: Record<string, unknown>,
): Partial<DeviceRegistration> {
	const headerDeviceId = headers[DEVICE_ID_HEADER];
	const deviceId =
		(typeof headerDeviceId === "string" ? headerDeviceId : undefined) ??
		(typeof body?.device_id === "string" ? body.device_id : undefined) ??
		(typeof query?.device_id === "string" ? query.device_id : undefined);

	const platform =
		(typeof body?.platform === "string" ? body.platform : undefined) ??
		(typeof query?.platform === "string" ? query.platform : undefined);

	return {
		deviceId,
		platform: isDevicePlatform(platform) ? platform : undefined,
		platformVersion:
			(typeof body?.platform_version === "string"
				? body.platform_version
				: undefined) ??
			(typeof query?.platform_version === "string"
				? query.platform_version
				: undefined),
		appVersion:
			(typeof body?.app_version === "string" ? body.app_version : undefined) ??
			(typeof query?.app_version === "string" ? query.app_version : undefined),
		deviceName:
			(typeof body?.device_name === "string" ? body.device_name : undefined) ??
			(typeof query?.device_name === "string" ? query.device_name : undefined),
	};
}
