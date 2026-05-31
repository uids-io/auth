import { describe, it, expect } from 'vitest';
import { validateRedirectUri } from '../../src/oauth/clients.js';
import type { OAuthClient } from '../../src/types.js';

const client: OAuthClient = {
  id: 'test',
  name: 'Test',
  clientType: 'public',
  allowedRedirectUris: ['https://merchant.example.com/auth/callback'],
  allowedOrigins: ['https://merchant.example.com'],
  allowedScopes: ['openid', 'profile', 'email'],
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2592000,
  enabled: true,
};

describe('redirect_uri validation', () => {
  it('accepts exact match', () => {
    expect(validateRedirectUri(client, 'https://merchant.example.com/auth/callback')).toBe(true);
  });

  it('rejects partial match', () => {
    expect(validateRedirectUri(client, 'https://merchant.example.com/auth/callback/extra')).toBe(false);
  });
});
