import type { AuthKit } from '../config.js';

export async function getJwks(kit: AuthKit): Promise<{ keys: unknown[] }> {
  return kit.tokens.getPublicJwks();
}
