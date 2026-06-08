# Bruno API collections

## UIDs Auth Server (`uids-auth-api/`)

OpenCollection (YAML) Bruno collection for the HTTP API exposed by `@advcomm/uids-io-auth` via `createAuthRouter`.

### Open as its own collection

1. **Bruno** → **Import collection**
2. Choose **OpenCollection (YAML)**
3. Select folder: `bruno/uids-auth-api` (must contain `opencollection.yml`)

Use this when auth lives in a separate repo from backend APIs.

---

## Merge into your existing backend collection (recommended)

Bruno allows **one** `opencollection.yml` per collection. You do **not** import a second collection root; you **copy request folders** into the collection you already use.

### Steps

1. Open your existing backend collection folder on disk, e.g.  
   `your-monorepo/api-docs/opencollection/` (path varies).

2. Create a parent folder for auth routes, e.g. `uids-auth/`.

3. Copy these directories from this repo into that folder:

   ```
   bruno/uids-auth-api/oidc      →  your-collection/uids-auth/oidc/
   bruno/uids-auth-api/oauth     →  your-collection/uids-auth/oauth/
   bruno/uids-auth-api/devices   →  your-collection/uids-auth/devices/
   bruno/uids-auth-api/email     →  your-collection/uids-auth/email/
   bruno/uids-auth-api/session   →  your-collection/uids-auth/session/
   bruno/uids-auth-api/social    →  your-collection/uids-auth/social/
   ```

4. Add a folder descriptor `your-collection/uids-auth/folder.yml`:

   ```yaml
   info:
     name: UIDs Auth Server
     type: folder
     seq: 50
   docs: |-
     Auth server (`createAuthRouter`). Base URL: {{authBaseUrl}}
   ```

   Set `seq` so it sorts where you want in the sidebar.

5. **Do not** copy `opencollection.yml` from `uids-auth-api` — keep your collection’s existing root file.

6. **Merge environment variables** into each of your existing environment files  
   (`environments/local.yml`, `staging.yml`, etc.). Add from  
   `bruno/uids-auth-api/environments/local.yml`:

   | Variable | Example |
   |----------|---------|
   | `authBaseUrl` | `http://localhost:3000` |
   | `clientId` | `merchant_portal_web` |
   | `redirectUri` | `http://localhost:5173/auth/callback` |
   | `deviceId` | UUID |
   | `codeVerifier` / `codeChallenge` | PKCE (before authorize) |
   | `authorizationCode` | from callback `?code=` |
   | `accessToken` / `refreshToken` | filled by token/refresh scripts |

   Keep your existing `baseUrl` / `apiBaseUrl` for **resource APIs** unchanged.

7. Reload the collection in Bruno (restart app or re-open collection if folders do not appear).

### After merge

- Auth requests live under **UIDs Auth Server** in the same sidebar as Users, Orders, etc.
- Run **Exchange authorization code** or **Refresh tokens** in the auth folder; `accessToken` is stored via after-response scripts.
- Use `Authorization: Bearer {{accessToken}}` on backend API requests (same environment).

### Separate collections (alternative)

Keep `uids-auth-api` imported as a second collection in the same **workspace**. Copy `accessToken` manually between environments when testing cross-service flows.

---

### Local dev

1. Start auth server: `examples/express-auth-server` (port 3000)
2. Select **Local** environment
3. Adjust `clientId` / `redirectUri` per portal (`merchant_portal_web`, `agency_portal_web`, …)

### PKCE and auto-filled environment variables

**Authorize (PKCE)** runs a **before-request** script that generates `codeVerifier` and `codeChallenge` when they are empty.

**After-response** scripts (where applicable) set:

| Variable | Set by |
|----------|--------|
| `pendingState` | Authorize → redirect to `/login?state=` |
| `authorizationCode` | Authorize / password login / magic callback → `?code=` |
| `oauthState` | Redirect `?state=` (portal callback) |
| `accessToken` / `refreshToken` | Token exchange, refresh |
| `csrfToken` / `sessionCookie` | Set-Cookie on login/token |
| `codeVerifier` / `codeChallenge` | Authorize before-request |
| `lastUserId` | Register / password login JSON |

Reference copy of helpers: `uids-auth-api/_lib/env-scripts.js` (inline in each request; edit both if you change logic).

**Suggested flow in Bruno:** OAuth Providers → Authorize → (optional) Google Start in browser → Exchange authorization code → use `{{accessToken}}` on API collection.

### Gaps to keep in sync with code

When adding auth routes, update this collection and [sdk-contract.md](../docs/sdk-contract.md). Recent additions:

- `GET /.well-known/oauth-providers` — portal custom login buttons
- `X-Uids-Token-Delivery: cookie` on `/token` and `/refresh` — see **Exchange code (refresh in cookie)** and **Refresh tokens (cookie)**
- `login_provider` query on `/authorize` (optional)

### Related docs

- [docs/sdk-contract.md](../docs/sdk-contract.md) — client SDK contract
- [README.md](../README.md) — server setup
