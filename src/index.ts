export {
	type AuthConfig,
	type AuthConfigInput,
	type AuthKit,
	createAuthKit,
} from "./config.js";
export { generatePkcePair, verifyCodeChallenge } from "./crypto/pkce.js";
export { runAuthMigrations } from "./db/migrations.js";
export {
	AuthError,
	ConflictError,
	ForbiddenError,
	InvalidRequestError,
	isAuthError,
	isValidationError,
	RateLimitError,
	UnauthorizedError,
	type ValidationDetail,
	ValidationError,
} from "./errors.js";
export { buildIssuerUrl, normalizeIssuer } from "./issuerUrl.js";
export { createAuthRouter } from "./express/createAuthRouter.js";
export { type RequireAuthConfig, requireAuth } from "./express/requireAuth.js";
export { mapGoogleProfile } from "./oauth/providers/google.js";
export { mapMicrosoftProfile } from "./oauth/providers/microsoft.js";
export {
	type AuthIdpConsole,
	type AuthLoginProviderId,
	type AuthProviderInfo,
	type AuthProvidersResponse,
	getAuthProviders,
} from "./oidc/providers.js";
export { AuthService } from "./services/authService.js";
export { DeviceService } from "./services/deviceService.js";
export { OAuthClientService } from "./services/oauthClientService.js";
export { SessionService } from "./services/sessionService.js";
export {
	TokenService,
	type VerifyAccessTokenOptions,
	verifyAccessToken,
} from "./services/tokenService.js";
export { UserService } from "./services/userService.js";
export type {
	AccessTokenClaims,
	AuthContext,
	AuthUser,
	Device,
	DevicePlatform,
	DeviceRegistration,
	OAuthClient,
	PendingAuthContext,
	ProviderProfile,
	RateLimiter,
	TokenResponse,
} from "./types.js";
export { DEVICE_ID_HEADER, parseDeviceContext } from "./types.js";
