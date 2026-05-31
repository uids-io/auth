import { createHash, randomBytes } from 'node:crypto';
import { constantTimeEqual } from './random.js';

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (method !== 'S256') {
    return false;
  }
  const expected = generateCodeChallenge(verifier);
  return constantTimeEqual(expected, challenge);
}

export function generatePkcePair(): { verifier: string; challenge: string; method: 'S256' } {
  const verifier = generateCodeVerifier();
  return {
    verifier,
    challenge: generateCodeChallenge(verifier),
    method: 'S256',
  };
}
