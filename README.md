# @uids-io/auth

Production-ready authentication for Node.js backends: OAuth 2.0/OIDC, sessions, refresh tokens, SDK-registered device tracking, and Express integration.

## Installation

```bash
npm install @uids-io/auth pg express
```

Peer dependencies: `pg`, `express` (optional for non-HTTP usage).

## Database migrations

Migrations are **not** run automatically. Call explicitly on startup:

```typescript
import { Pool } from 'pg';
import { runAuthMigrations } from '@uids-io/auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runAuthMigrations(pool);
```

## Auth server (auth.example.com)

```typescript
import express from 'express';
import { createAuthKit, createAuthRouter, runAuthMigrations, seedDefaultPortalClients } from '@uids-io/auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runAuthMigrations(pool);

await seedDefaultPortalClients(pool, {
  merchantRedirectUris: ['https://merchant.example.com/auth/callback'],
  agencyRedirectUris: ['https://agency.example.com/auth/callback'],
  influencerRedirectUris: ['https://influencer.example.com/auth/callback'],
  adminRedirectUris: ['https://admin.example.com/auth/callback'],
});

const authKit = await createAuthKit({
  issuer: 'https://auth.example.com',
  apiAudience: 'https://api.example.com',
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
      callbackUrl: 'https://auth.example.com/oauth/google/callback',
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenant: 'common',
      callbackUrl: 'https://auth.example.com/oauth/microsoft/callback',
    },
  },
  email: {
    sendMagicLink: async (email, url) => {
      // integrate with your email provider
      console.log('Magic link for', email, url);
    },
  },
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', createAuthRouter(authKit));
app.listen(3000);
```

See [`examples/express-auth-server`](examples/express-auth-server).

## API server (api.example.com)

```typescript
import express from 'express';
import { requireAuth } from '@uids-io/auth';

const app = express();
app.use(express.json());

app.use(requireAuth({
  issuer: 'https://auth.example.com',
  audience: 'https://api.example.com',
  jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
}));

app.get('/me', (req, res) => {
  res.json({ auth: req.auth });
});
```

Configure CORS on the API to allow your portal origins. This package does not set API CORS headers.

See [`examples/express-api-server`](examples/express-api-server).

## Google Cloud OAuth setup

1. Create an OAuth 2.0 Client ID (Web application) in Google Cloud Console.
2. Authorized redirect URI: `https://auth.example.com/oauth/google/callback`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your auth server environment.

## Microsoft Entra setup

1. Register an application in Microsoft Entra ID.
2. Add redirect URI: `https://auth.example.com/oauth/microsoft/callback`
3. Create a client secret.
4. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and configure `tenant` (`common`, `organizations`, `consumers`, or a tenant ID).

## Portal OAuth client seeding

```typescript
await seedDefaultPortalClients(pool, {
  merchantRedirectUris: ['https://merchant.example.com/auth/callback'],
  agencyRedirectUris: ['https://agency.example.com/auth/callback'],
  influencerRedirectUris: ['https://influencer.example.com/auth/callback'],
  adminRedirectUris: ['https://admin.example.com/auth/callback'],
});
```

Seeded clients: `merchant_portal_web`, `agency_portal_web`, `influencer_portal_web`, `admin_portal_web` (all public, PKCE).

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

See [docs/sdk-contract.md](docs/sdk-contract.md) for the full SDK contract.

### Recommended companion SDKs (future packages)

| Platform | Package | Storage |
|----------|---------|---------|
| React / Next.js | `@uids-io/auth-react` | localStorage / IndexedDB |
| Flutter web + mobile | `@uids-io/auth-flutter` | shared_preferences / Keychain |
| iOS / Android native | `@uids-io/auth-native` | Keychain / EncryptedSharedPreferences |
| Desktop | `@uids-io/auth-react` or native wrapper | OS keychain |

## Exports

- `createAuthKit`, `createAuthRouter`, `requireAuth`
- `verifyAccessToken`, `runAuthMigrations`, `seedDefaultPortalClients`
- `AuthService`, `UserService`, `TokenService`, `DeviceService`
- Types, errors, PKCE helpers, provider profile mappers

## License

MIT
