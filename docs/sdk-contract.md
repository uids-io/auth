# Client SDK Contract

This document defines the contract between `@advcomm/uids-io-auth` (server) and companion client SDKs. SDK packages (`@uids-io/auth-react`, `@uids-io/auth-flutter`, etc.) are maintained separately.

**Bruno / OpenCollection:** [../bruno/uids-auth-api](../bruno/uids-auth-api) — HTTP API collection for `createAuthRouter` (import with backend API docs).

## Device identity model

- Each client instance generates a **UUID v4** `device_id` on first launch.
- The SDK persists `device_id` in platform-appropriate storage.
- The SDK registers the device with the auth server before or during login.
- The auth server binds the device to the user on successful authentication.
- Access tokens may include `device_id` and `platform` claims.

**Do not use browser fingerprinting.** Only SDK-provided identifiers are trusted.

## Transport

Send device context using:

| Channel | Name |
|---------|------|
| Header | `X-Uids-Device-Id: {uuid}` |
| Body/query | `device_id`, `platform`, `platform_version`, `app_version`, `device_name` |

### Platform values

`web` | `ios` | `android` | `desktop` | `unknown`

## Required SDK methods

```typescript
interface AuthSdk {
  getDeviceId(): Promise<string>;
  registerDevice(): Promise<void>;
  authorize(options: AuthorizeOptions): Promise<void>;
  exchangeCode(code: string, verifier: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  listDevices(): Promise<Device[]>;
  revokeDevice(deviceId: string): Promise<void>;
}
```

## Registration

Call on app start:

```http
POST /devices/register
Content-Type: application/json

{
  "client_id": "merchant_portal_web",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "platform": "ios",
  "platform_version": "17.0",
  "app_version": "1.2.0",
  "device_name": "iPhone 15"
}
```

## Login providers (Google, Microsoft, email)

```http
GET /.well-known/oauth-providers
```

Returns `{ issuer, providers: [{ id, enabled }] }` where `id` is `google` | `microsoft` | `email`.

Optional on `/authorize`: `login_provider=google` (or `microsoft`, `email`) to skip the hosted login chooser and redirect directly when that provider is enabled on the auth server.

## OAuth PKCE flow

1. Generate `{ verifier, challenge }` with S256.
2. Call `POST /devices/register` (optional but recommended).
3. Redirect to `/authorize` with PKCE params and `device_id`.
4. Handle callback with `code` and `state`.
5. Call `POST /token` with `code_verifier`, `device_id` header.

## Token storage

| Platform | Refresh token storage |
|----------|----------------------|
| Web (React) | **Default:** HttpOnly cookie on auth issuer (`X-Uids-Token-Delivery: cookie`); access token in memory. **Fallback:** `refresh_token` in JSON + `tokenDelivery: body` |
| iOS | Keychain |
| Android | EncryptedSharedPreferences / Keystore |
| Desktop | OS keychain |

### Cookie delivery (web)

On `POST /token` and `POST /refresh`, send header `X-Uids-Token-Delivery: cookie` and `credentials: include`. Server sets `uids_refresh_token` HttpOnly cookie and omits `refresh_token` from JSON. `/refresh` accepts cookie or body `refresh_token`.

## Platform recommendations

### React / Next.js (`@uids-io/auth-react`)

- Store `device_id` in `localStorage` or IndexedDB.
- Use PKCE authorization code flow.
- Attach `X-Uids-Device-Id` on token and refresh requests.
- Clear `device_id` on explicit logout if desired for shared devices.

### Flutter web (`@uids-io/auth-flutter`)

- Same contract as React.
- Use `shared_preferences` for `device_id`.
- Use `flutter_web_auth_2` or in-app WebView for OAuth redirects.

### iOS / Android

- Require `device_id` on all auth flows.
- Store refresh tokens in secure storage only.
- Use custom URL scheme or App Links for OAuth redirect.

### Desktop (Electron / Tauri)

- Treat as `platform: desktop`.
- Use loopback redirect URI (e.g. `http://127.0.0.1:8765/callback`) registered in OAuth client.
- Store secrets in OS keychain.

## Server endpoints used by SDKs

| Method | Path |
|--------|------|
| GET | `/.well-known/openid-configuration` |
| GET | `/.well-known/oauth-providers` |
| GET | `/.well-known/jwks.json` |
| POST | `/devices/register` |
| GET | `/devices` |
| POST | `/devices/revoke` |
| GET | `/authorize` |
| GET | `/oauth/google/start`, `/oauth/microsoft/start` |
| POST | `/token` |
| POST | `/refresh` |
| POST | `/logout` |
| POST | `/email/password/login`, `/email/password/register` |
| POST | `/email/magic/start` |
| GET | `/email/magic/callback` |
| GET | `/session`, POST `/session/revoke` |

## Access token claims (when device-bound)

```json
{
  "sub": "12345",
  "aud": "https://api.example.com",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "platform": "ios"
}
```

API apps read these via `requireAuth` middleware (`req.auth.deviceId`, `req.auth.platform`).
