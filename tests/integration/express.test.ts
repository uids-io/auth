import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SignJWT } from 'jose';
import request from 'supertest';
import { createTestAuthKit, setupTestDb, teardownTestDb } from '../helpers/testDb.js';
import type { AuthKit } from '../../src/config.js';
import { createAuthTestApp, createProtectedApiTestApp } from '../helpers/apps.js';

describe('integration express', () => {
  let kit: AuthKit;
  let apiApp: Awaited<ReturnType<typeof createProtectedApiTestApp>>;
  let authApp: ReturnType<typeof createAuthTestApp>;

  beforeAll(async () => {
    await setupTestDb();
    kit = await createTestAuthKit();

    apiApp = await createProtectedApiTestApp(kit);
    authApp = createAuthTestApp(kit);
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

    it('returns invalid_token for malformed bearer token', async () => {
      const res = await request(apiApp)
        .get('/me')
        .set('Authorization', 'Bearer definitely.not.a.valid.token');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: 'invalid_token',
        error_description: 'Token validation failed',
      });
    });

    it('rejects token missing required claims', async () => {
      const { kid, privateKey } = await kit.tokens.getActiveSigningKey();
      const token = await new SignJWT({
        client_id: 'merchant_portal_web',
      })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(kit.config.issuer)
        .setAudience(kit.config.apiAudience)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

      const res = await request(apiApp)
        .get('/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: 'invalid_token',
        error_description: 'Token validation failed',
      });
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

  describe('csrf and session cookie security', () => {
    it('rejects logout when csrf header does not match cookie', async () => {
      const user = await kit.users.createUser({ email: 'csrf@test.com', emailVerified: true });
      const { sessionToken, csrfToken } = await kit.sessions.createSession({
        userId: user.id,
        clientId: 'merchant_portal_web',
      });

      const signed = kit.sessions.signSessionCookie(sessionToken);
      const res = await request(authApp)
        .post('/logout')
        .set('Cookie', [`${kit.config.cookie.name}=${signed}`, `uids_csrf=${csrfToken}`])
        .set('X-CSRF-Token', 'mismatch-token')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: 'csrf_failed',
        error_description: 'CSRF validation failed',
      });
    });

    it('does not authenticate tampered signed session cookies', async () => {
      const user = await kit.users.createUser({ email: 'cookie@test.com', emailVerified: true });
      const { sessionToken, csrfToken } = await kit.sessions.createSession({
        userId: user.id,
        clientId: 'merchant_portal_web',
      });

      const signed = kit.sessions.signSessionCookie(sessionToken);
      const tampered = `${signed}tampered`;
      const res = await request(authApp)
        .get('/session')
        .set('Cookie', [`${kit.config.cookie.name}=${tampered}`, `uids_csrf=${csrfToken}`]);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('allows logout by refresh token without session cookie', async () => {
      const user = await kit.users.createUser({ email: 'logout-refresh@test.com', emailVerified: true });
      const { session } = await kit.sessions.createSession({
        userId: user.id,
        clientId: 'merchant_portal_web',
      });
      const tokens = await kit.tokens.issueTokens({
        user,
        clientId: 'merchant_portal_web',
        scopes: ['openid'],
        sessionId: session.id,
      });
      const refreshToken = tokens.refresh_token;
      expect(refreshToken).toBeDefined();
      if (!refreshToken) {
        throw new Error('Expected refresh token to be present');
      }

      const res = await request(authApp)
        .post('/logout')
        .send({ refresh_token: refreshToken });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });

      await expect(kit.tokens.refreshAccessToken(refreshToken)).rejects.toThrow(
        /invalid|revoked|reuse/i,
      );
    });
  });

  describe('device validation', () => {
    it('rejects unsupported device platform', async () => {
      const res = await request(authApp).post('/devices/register').send({
        client_id: 'merchant_portal_web',
        device_id: 'd-123',
        platform: 'playstation',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(res.body.error_description).toMatch(/Invalid body:/);
    });
  });
});
