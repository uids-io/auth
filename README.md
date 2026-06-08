# @advcomm/uids-io-auth

Production-ready authentication for Node.js backends: OAuth 2.0/OIDC, sessions, refresh tokens, SDK-registered device tracking, and an optional Express adapter.

The package is **not Express-only** — services (`AuthService`, `TokenService`, etc.) are framework-agnostic. Use `createAuthRouter` when you want a ready-made HTTP surface on Express.

## Installation

```bash
npm install @advcomm/uids-io-auth pg express
```

| Dependency | Role |
|------------|------|
| `pg` | Required — PostgreSQL access |
| `express` | Optional peer — only needed for `createAuthRouter` / `requireAuth` |

Subpath export (if you split Express-only imports):

```typescript
import { createAuthRouter } from '@advcomm/uids-io-auth/express';
```

## Environment variables

Use these in your auth server (see [`examples/express-auth-server/.env.example`](examples/express-auth-server/.env.example)):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ISSUER` | Yes | Public auth issuer URL (e.g. `https://auth.example.com`) |
| `API_AUDIENCE` | Yes | Resource server audience for access tokens |
| `CSRF_SECRET` | Yes (prod) | Secret for signing CSRF/session cookies — **must** be set explicitly in production (no fallback) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | If using Google | OAuth client credentials |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | If using Microsoft | Entra app credentials |
| `MICROSOFT_TENANT` | No | Default `common` |
| `LOG_LEVEL` | No | Pino level: `debug`, `info`, `warn`, `error` (default: `debug` in dev, `info` in production) |

Register OAuth clients for each portal with `OAuthClientService.upsertPublicClient` (see [Portal OAuth clients](#portal-oauth-clients)). The example auth server uses a local seed helper, not a package export.

## Database migrations

Migrations are **not** run automatically. Call explicitly on startup:

```typescript
import { Pool } from 'pg';
import { runAuthMigrations } from '@advcomm/uids-io-auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runAuthMigrations(pool);
```

## Auth server (auth.example.com)

```typescript
import express from 'express';
import { Pool } from 'pg';
import {
  createAuthKit,
  createAuthRouter,
  OAuthClientService,
  runAuthMigrations,
} from '@advcomm/uids-io-auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runAuthMigrations(pool);

// Register one public OAuth client per portal (PKCE). Repeat per app.
const oauthClients = new OAuthClientService(pool);
await oauthClients.upsertPublicClient({
  id: 'merchant_portal_web',
  name: 'Merchant Portal Web',
  redirectUris: ['https://merchant.example.com/auth/callback'],
});

const authKit = await createAuthKit({
  issuer: process.env.ISSUER!,
  apiAudience: process.env.API_AUDIENCE!,
  pg: pool,
  cookie: {
    name: 'uids_auth_session',
    domain: '.example.com',
    secure: true,
    sameSite: 'lax',
  },
  csrf: { secret: process.env.CSRF_SECRET! },
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackUrl: `${process.env.ISSUER}/oauth/google/callback`,
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenant: process.env.MICROSOFT_TENANT ?? 'common',
      callbackUrl: `${process.env.ISSUER}/oauth/microsoft/callback`,
    },
  },
  email: {
    sendMagicLink: async (email, url) => {
      // integrate with your email provider
    },
  },
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', createAuthRouter(authKit));
app.listen(3000);
```

`createAuthRouter` mounts:

- **OIDC** — `/.well-known/openid-configuration`, `/.well-known/jwks.json`, `/login`
- **OAuth** — `/authorize`, `/token`, provider callbacks, `/logout`
- **Email** — magic link and password login routes
- **Sessions** — session cookie introspection and revoke
- **Devices** — register, list, revoke (CSRF-protected where required)
- **Middleware** — CORS, CSRF on state-changing routes, Zod validation, centralized error handling

See [`examples/express-auth-server`](examples/express-auth-server).

**API docs (Bruno):** Import OpenCollection [`bruno/uids-auth-api`](bruno/uids-auth-api) into your Bruno workspace alongside backend service collections — see [`bruno/README.md`](bruno/README.md).

## API server (api.example.com)

```typescript
import express from 'express';
import { requireAuth } from '@advcomm/uids-io-auth';

const app = express();
app.use(express.json());

app.use(requireAuth({
  issuer: process.env.ISSUER!,
  audience: process.env.API_AUDIENCE!,
  jwksUrl: `${process.env.ISSUER}/.well-known/jwks.json`,
}));

app.get('/me', (req, res) => {
  res.json({ auth: req.auth });
});
```

Configure CORS on the API to allow your portal origins. This package does not set API CORS headers.

See [`examples/express-api-server`](examples/express-api-server).

## Errors and logging

The Express adapter uses two response shapes so OAuth clients and REST portals both get usable errors.

### Validation errors (Zod, HTTP 422)

Routes validated with the built-in middleware return **all** field issues:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      { "field": "client_id", "message": "Required" },
      { "field": "platform", "message": "Invalid enum value..." }
    ]
  }
}
```

Use `ValidationError`, `isValidationError`, and `ValidationDetail` from the package if you handle errors in custom middleware.

### OAuth / auth errors (HTTP 4xx)

Business and OAuth-style failures use the familiar shape:

```json
{
  "error": "invalid_request",
  "error_description": "Invalid refresh token"
}
```

Other exported errors: `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `RateLimitError`, `InvalidRequestError`, and base `AuthError`.

### Server errors (HTTP 500)

Unexpected errors return a generic body (no stack or internal details). Full error context is logged server-side only.

### Structured logs (Pino)

The router logs via **Pino** to stdout:

| Situation | Level | What is logged |
|-----------|-------|----------------|
| Request validation failed | `warn` | scope, field names, issue count (not request body values) |
| Expected auth errors | `info` | error code, status, method, path |
| Unexpected errors | `error` | error name/message, method, path |

Set `LOG_LEVEL=debug` locally. In production, logs are JSON (no pretty-print).

**Tracing:** pass `X-Request-Id` from your gateway or API; it is included in log context when present.

## Google Cloud OAuth setup

1. Create an OAuth 2.0 Client ID (Web application) in Google Cloud Console.
2. Authorized redirect URI: `https://auth.example.com/oauth/google/callback`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your auth server environment.

## Microsoft Entra setup

1. Register an application in Microsoft Entra ID.
2. Add redirect URI: `https://auth.example.com/oauth/microsoft/callback`
3. Create a client secret.
4. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and configure `tenant` (`common`, `organizations`, `consumers`, or a tenant ID).

## Portal OAuth clients

Each portal is a **public** OAuth client (PKCE, no client secret in the browser):

```typescript
import { OAuthClientService } from '@advcomm/uids-io-auth';

const oauthClients = new OAuthClientService(pool);
await oauthClients.upsertPublicClient({
  id: 'your_portal_web',
  name: 'Your Portal Web',
  redirectUris: ['https://your-portal.example.com/auth/callback'],
  // origins optional — derived from redirect URIs when omitted
});
```

For local dev with multiple UIDs portals, see [`examples/express-auth-server/seedPortalClients.ts`](examples/express-auth-server/seedPortalClients.ts) (`merchant_portal_web`, `agency_portal_web`, etc.). That helper is **not** exported from the package.

## Login flow (PKCE)

1. Portal generates PKCE verifier/challenge and optional SDK `device_id`.
2. Portal redirects user to `GET /authorize?response_type=code&client_id=...&redirect_uri=...&scope=openid profile email&state=...&code_challenge=...&code_challenge_method=S256`
3. User authenticates on auth domain (Google, Microsoft, or email).
4. Auth domain redirects to portal `redirect_uri?code=...&state=...`
5. Portal calls `POST /token` with `grant_type=authorization_code`, `code`, `code_verifier`, `client_id`, `redirect_uri`.
6. Portal receives `access_token`, `refresh_token`, and optional `id_token`.
7. Portal calls API with `Authorization: Bearer {access_token}`.

## Device identity

Companion client SDKs (React, Flutter, native) generate a stable UUID `device_id`, register it via `POST /devices/register`, and send `X-Uids-Device-Id` on auth flows. The auth server binds devices to users and includes `device_id` in access token claims.

Supported platforms: `web`, `ios`, `android`, `desktop`, `unknown` (validated on register).

See [docs/sdk-contract.md](docs/sdk-contract.md) for the full client/server contract.

### Recommended companion SDKs (future packages)

| Platform | Package | Storage |
|----------|---------|---------|
| React / Next.js | `@uids-io/auth-react` | localStorage / IndexedDB |
| Flutter web + mobile | `@uids-io/auth-flutter` | shared_preferences / Keychain |
| iOS / Android native | `@uids-io/auth-native` | Keychain / EncryptedSharedPreferences |
| Desktop | `@uids-io/auth-react` or native wrapper | OS keychain |

## Exports

**Kit & HTTP**

- `createAuthKit`, `createAuthRouter`, `requireAuth`
- `runAuthMigrations`
- `verifyAccessToken`, `generatePkcePair`, `verifyCodeChallenge`

**Services** (use directly without Express)

- `AuthService`, `UserService`, `TokenService`, `SessionService`, `DeviceService`, `OAuthClientService`

**Errors**

- `AuthError`, `InvalidRequestError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `RateLimitError`
- `isAuthError`, `isValidationError`, `ValidationDetail`

**Types & helpers**

- `AuthUser`, `AuthContext`, `Device`, `DevicePlatform`, `TokenResponse`, provider mappers, etc.

## Testing

```bash
npm test              # all tests
npm run test:unit     # crypto, redirect_uri, provider mapping
npm run test:integration  # DB + Express flows (uses pg-mem by default)
npm run typecheck
npm run build
```

Integration tests use **pg-mem** by default (no Docker required). Optional backends:

- `TEST_DATABASE_URL=postgres://...` — run against an existing PostgreSQL instance
- `USE_TESTCONTAINERS=1` — use Docker testcontainers when available

## Releases

Releases on **`main`** use **semantic-release** — see [RELEASING.md](RELEASING.md). Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, etc.) so version bumps and npm publish happen automatically.

## License

MIT
