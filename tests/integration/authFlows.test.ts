import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generatePkcePair } from '../../src/crypto/pkce.js';
import { createTestAuthKit, setupTestDb, teardownTestDb } from '../helpers/testDb.js';
import type { AuthKit } from '../../src/config.js';
import { hashPassword } from '../../src/crypto/password.js';

describe('integration auth flows', () => {
  let kit: AuthKit;

  beforeAll(async () => {
    await setupTestDb();
    kit = await createTestAuthKit();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('authorization code and JWT', () => {
    it('creates single-use authorization code', async () => {
      const user = await kit.users.createUser({
        email: 'oauth@test.com',
        emailVerified: true,
      });
      const { verifier, challenge, method } = generatePkcePair();

      const code = await kit.tokens.createAuthorizationCode({
        clientId: 'merchant_portal_web',
        userId: user.id,
        redirectUri: 'https://merchant.example.com/auth/callback',
        scopes: ['openid', 'email'],
        codeChallenge: challenge,
        codeChallengeMethod: method,
      });

      const first = await kit.tokens.exchangeAuthorizationCode({
        code,
        clientId: 'merchant_portal_web',
        redirectUri: 'https://merchant.example.com/auth/callback',
        codeVerifier: verifier,
      });
      expect(first.userId).toBe(user.id);

      await expect(
        kit.tokens.exchangeAuthorizationCode({
          code,
          clientId: 'merchant_portal_web',
          redirectUri: 'https://merchant.example.com/auth/callback',
          codeVerifier: verifier,
        }),
      ).rejects.toThrow(/already used/);
    });

    it('issues and verifies JWT access token', async () => {
      const user = await kit.users.createUser({
        email: 'jwt@test.com',
        emailVerified: true,
      });
      const device = await kit.devices.registerDevice({
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        clientId: 'merchant_portal_web',
        platform: 'web',
      });
      await kit.devices.bindDeviceToUser(device.deviceId, device.clientId, user.id);

      const { session } = await kit.sessions.createSession({
        userId: user.id,
        clientId: 'merchant_portal_web',
        devicePk: device.id,
      });

      const tokens = await kit.tokens.issueTokens({
        user,
        clientId: 'merchant_portal_web',
        scopes: ['openid', 'email'],
        sessionId: session.id,
        device,
      });

      const { verifyAccessToken } = await import('../../src/services/TokenService.js');
      const claims = await verifyAccessToken({
        token: tokens.access_token,
        issuer: kit.config.issuer,
        audience: kit.config.apiAudience,
        localJwks: (await kit.tokens.getPublicJwks()).keys,
      });

      expect(claims.sub).toBe(String(user.id));
      expect(claims.device_id).toBe(device.deviceId);
      expect(claims.aud).toBe(kit.config.apiAudience);
    });
  });

  describe('refresh token rotation and reuse detection', () => {
    it('rotates refresh token and detects reuse', async () => {
      const user = await kit.users.createUser({ email: 'refresh@test.com', emailVerified: true });
      const { session } = await kit.sessions.createSession({
        userId: user.id,
        clientId: 'merchant_portal_web',
      });
      const initial = await kit.tokens.issueTokens({
        user,
        clientId: 'merchant_portal_web',
        scopes: ['openid'],
        sessionId: session.id,
      });
      const oldRefresh = initial.refresh_token!;

      const rotated = await kit.tokens.refreshAccessToken(oldRefresh);
      expect(rotated.tokens.refresh_token).toBeDefined();
      expect(rotated.tokens.refresh_token).not.toBe(oldRefresh);

      await expect(kit.tokens.refreshAccessToken(oldRefresh)).rejects.toThrow(/reuse/);
    });
  });

  describe('account linking', () => {
    it('links verified email to existing user', async () => {
      await kit.users.createUser({ email: 'link@test.com', emailVerified: true });
      const user = await kit.users.resolveOrCreateFromProvider({
        provider: 'google',
        providerSubject: 'google-new',
        email: 'link@test.com',
        emailVerified: true,
        rawProfile: {},
      });
      const byProvider = await kit.users.findByProviderIdentity('google', 'google-new');
      expect(byProvider?.id).toBe(user.id);
    });

    it('creates new user when no match', async () => {
      const user = await kit.users.resolveOrCreateFromProvider({
        provider: 'google',
        providerSubject: 'google-brand-new',
        email: 'brandnew@test.com',
        emailVerified: true,
        rawProfile: {},
      });
      expect(user.primaryEmail).toBe('brandnew@test.com');
    });
  });

  describe('device registration', () => {
    it('registers and binds device', async () => {
      const device = await kit.devices.registerDevice({
        deviceId: '6ba7b811-9dad-41d1-80b4-00c04fd430c8',
        clientId: 'merchant_portal_web',
        platform: 'ios',
        deviceName: 'iPhone',
      });
      expect(device.platform).toBe('ios');

      const user = await kit.users.createUser({ email: 'device@test.com', emailVerified: true });
      const bound = await kit.devices.bindDeviceToUser(device.deviceId, device.clientId, user.id);
      expect(bound.userId).toBe(user.id);

      const devices = await kit.devices.listUserDevices(user.id);
      expect(devices).toHaveLength(1);
    });
  });

  describe('password register flow', () => {
    it('registers user with password hash', async () => {
      const hash = await hashPassword('password123');
      const user = await kit.users.registerWithEmail({
        email: 'register@test.com',
        passwordHash: hash,
      });
      expect(user.primaryEmail).toBe('register@test.com');
      const stored = await kit.users.getPasswordHash(user.id);
      expect(stored).toBeTruthy();
    });
  });
});
