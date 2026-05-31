export { createAuthKit, type AuthKit, type AuthConfig, type AuthConfigInput } from './config.js';
export { runAuthMigrations } from './db/migrations.js';
export { seedDefaultPortalClients, type SeedPortalClientsInput } from './services/OAuthClientService.js';
export { verifyAccessToken, type VerifyAccessTokenOptions } from './services/TokenService.js';
export { AuthService } from './services/AuthService.js';
export { UserService } from './services/UserService.js';
export { TokenService } from './services/TokenService.js';
export { DeviceService } from './services/DeviceService.js';
export { OAuthClientService } from './services/OAuthClientService.js';
export { SessionService } from './services/SessionService.js';
export { createAuthRouter } from './express/createAuthRouter.js';
export { requireAuth, type RequireAuthConfig } from './express/requireAuth.js';
export {
  AuthError,
  InvalidRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  isAuthError,
} from './errors.js';
export type {
  AuthUser,
  AuthContext,
  AccessTokenClaims,
  OAuthClient,
  Device,
  DevicePlatform,
  DeviceRegistration,
  TokenResponse,
  RateLimiter,
  PendingAuthContext,
  ProviderProfile,
} from './types.js';
export { DEVICE_ID_HEADER, parseDeviceContext } from './types.js';
export { generatePkcePair, verifyCodeChallenge } from './crypto/pkce.js';
export { mapGoogleProfile } from './oauth/providers/google.js';
export { mapMicrosoftProfile } from './oauth/providers/microsoft.js';
