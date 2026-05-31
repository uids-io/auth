import type { AuthKit } from '../config.js';

export async function sendMagicLinkEmail(
  kit: AuthKit,
  email: string,
  url: string,
): Promise<void> {
  if (!kit.config.email.sendMagicLink) {
    throw new Error('Magic link email sender not configured');
  }
  await kit.config.email.sendMagicLink(email, url);
}
