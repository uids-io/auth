import { describe, it, expect } from 'vitest';
import { hashToken, verifyTokenHash } from '../../src/crypto/tokens.js';

describe('token hashing', () => {
  it('hashes and verifies opaque tokens', () => {
    const token = 'opaque-refresh-token-value';
    const hash = hashToken(token);
    expect(verifyTokenHash(token, hash)).toBe(true);
    expect(verifyTokenHash('wrong-token', hash)).toBe(false);
  });
});
