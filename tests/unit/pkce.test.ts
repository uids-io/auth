import { describe, it, expect } from 'vitest';
import { generatePkcePair, verifyCodeChallenge } from '../../src/crypto/pkce.js';

describe('PKCE', () => {
  it('generates and verifies S256 challenge', () => {
    const { verifier, challenge, method } = generatePkcePair();
    expect(method).toBe('S256');
    expect(verifyCodeChallenge(verifier, challenge, 'S256')).toBe(true);
  });

  it('rejects wrong verifier', () => {
    const { challenge } = generatePkcePair();
    expect(verifyCodeChallenge('wrong-verifier', challenge, 'S256')).toBe(false);
  });
});
