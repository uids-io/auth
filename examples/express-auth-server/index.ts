import express from 'express';
import { Pool } from 'pg';
import { createAuthKit, createAuthRouter, runAuthMigrations } from '../../src/index.js';
import { seedDefaultPortalClients } from './seedPortalClients.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runAuthMigrations(pool);

await seedDefaultPortalClients(pool, {
  merchantRedirectUris: [process.env.MERCHANT_REDIRECT_URI ?? 'http://localhost:5173/auth/callback'],
  agencyRedirectUris: [process.env.AGENCY_REDIRECT_URI ?? 'http://localhost:5174/auth/callback'],
  influencerRedirectUris: [process.env.INFLUENCER_REDIRECT_URI ?? 'http://localhost:5175/auth/callback'],
  adminRedirectUris: [process.env.ADMIN_REDIRECT_URI ?? 'http://localhost:5176/auth/callback'],
});

const authKit = await createAuthKit({
  issuer: process.env.ISSUER ?? 'http://localhost:3000',
  apiAudience: process.env.API_AUDIENCE ?? 'http://localhost:4000',
  pg: pool,
  cookie: {
    name: 'uids_auth_session',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
  csrf: { secret: process.env.CSRF_SECRET ?? 'dev-csrf-secret-min-16-chars' },
  providers: {
    google: process.env.GOOGLE_CLIENT_ID
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackUrl: `${process.env.ISSUER ?? 'http://localhost:3000'}/oauth/google/callback`,
        }
      : undefined,
    microsoft: process.env.MICROSOFT_CLIENT_ID
      ? {
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
          tenant: process.env.MICROSOFT_TENANT ?? 'common',
          callbackUrl: `${process.env.ISSUER ?? 'http://localhost:3000'}/oauth/microsoft/callback`,
        }
      : undefined,
  },
  email: {
    sendMagicLink: async (email, url) => {
      console.log(`Magic link for ${email}: ${url}`);
    },
  },
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', createAuthRouter(authKit));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Auth server listening on http://localhost:${port}`);
});
