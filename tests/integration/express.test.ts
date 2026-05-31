import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestAuthKit, setupTestDb, teardownTestDb } from '../helpers/testDb.js';
import { createAuthRouter } from '../../src/express/createAuthRouter.js';
import { requireAuth } from '../../src/express/requireAuth.js';
import type { AuthKit } from '../../src/config.js';

describe('integration express', () => {
  let kit: AuthKit;
  let apiApp: express.Application;
  let authApp: express.Application;

  beforeAll(async () => {
    await setupTestDb();
    kit = await createTestAuthKit();

    const jwks = await kit.tokens.getPublicJwks();
    apiApp = express();
    apiApp.use(express.json());
    apiApp.use(
      requireAuth({
        issuer: kit.config.issuer,
        audience: kit.config.apiAudience,
        localJwks: jwks.keys,
      }),
    );
    apiApp.get('/me', (req, res) => {
      res.json({ auth: req.auth });
    });

    authApp = express();
    authApp.use(express.json());
    authApp.use(createAuthRouter(kit));
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('requireAuth middleware', () => {
    it('rejects missing token', async () => {
      const res = await request(apiApp).get('/me');
      expect(res.status).toBe(401);
    });

    it('accepts valid bearer token', async () => {
      const user = await kit.users.createUser({ email: 'api@test.com', emailVerified: true });
      const { session } = await kit.sessions.createSession({
        userId: user.id,
        clientId: 'merchant_portal_web',
      });
      const tokens = await kit.tokens.issueTokens({
        user,
        clientId: 'merchant_portal_web',
        scopes: ['openid', 'email'],
        sessionId: session.id,
      });

      const res = await request(apiApp)
        .get('/me')
        .set('Authorization', `Bearer ${tokens.access_token}`);
      expect(res.status).toBe(200);
      expect(res.body.auth.userId).toBe(user.id);
    });
  });

  describe('auth router OIDC metadata', () => {
    it('serves openid configuration', async () => {
      const res = await request(authApp).get('/.well-known/openid-configuration');
      expect(res.status).toBe(200);
      expect(res.body.issuer).toBe(kit.config.issuer);
    });

    it('serves jwks', async () => {
      const res = await request(authApp).get('/.well-known/jwks.json');
      expect(res.status).toBe(200);
      expect(res.body.keys.length).toBeGreaterThan(0);
    });
  });
});
