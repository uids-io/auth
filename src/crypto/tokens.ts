import { createHash } from 'node:crypto';
import { constantTimeEqual } from './random.js';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyTokenHash(token: string, hash: string): boolean {
  return constantTimeEqual(hashToken(token), hash);
}
