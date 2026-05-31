import type { AuthKit } from '../config.js';
import { verifyPassword, hashPassword } from '../crypto/password.js';
import { UnauthorizedError, InvalidRequestError } from '../errors.js';
import { completePendingAuthorize } from '../oauth/authorize.js';

export async function registerWithPassword(
  kit: AuthKit,
  params: { email: string; password: string; displayName?: string },
): Promise<{ userId: number }> {
  if (params.password.length < 8) {
    throw new InvalidRequestError('Password must be at least 8 characters', 'weak_password');
  }
  await kit.auth.checkRateLimit(`register:email:${params.email.toLowerCase()}`);
  const passwordHash = await hashPassword(params.password);
  const user = await kit.users.registerWithEmail({
    email: params.email,
    passwordHash,
    displayName: params.displayName,
  });
  return { userId: user.id };
}

export async function loginWithPassword(
  kit: AuthKit,
  params: {
    email: string;
    password: string;
    clientId?: string;
    pendingState?: string;
    ip?: string;
    userAgent?: string;
    deviceId?: string;
    platform?: import('../types.js').DevicePlatform;
  },
): Promise<{ redirectUrl?: string; sessionToken: string; csrfToken: string; userId: number }> {
  await kit.auth.checkRateLimit(`login:email:${params.email.toLowerCase()}`);
  if (params.ip) {
    await kit.auth.checkRateLimit(`login:ip:${params.ip}`);
  }

  const user = await kit.users.findByEmail(params.email);
  if (!user) {
    await kit.auth.recordLoginAttempt({
      email: params.email,
      provider: 'email',
      success: false,
      ip: params.ip,
      userAgent: params.userAgent,
      failureReason: 'user_not_found',
    });
    throw new UnauthorizedError('Invalid credentials', 'invalid_credentials');
  }

  const passwordHash = await kit.users.getPasswordHash(user.id);
  if (!passwordHash || !(await verifyPassword(params.password, passwordHash))) {
    await kit.auth.recordLoginAttempt({
      email: params.email,
      provider: 'email',
      deviceId: params.deviceId,
      success: false,
      ip: params.ip,
      userAgent: params.userAgent,
      failureReason: 'invalid_password',
    });
    throw new UnauthorizedError('Invalid credentials', 'invalid_credentials');
  }

  let devicePk: number | undefined;
  if (params.deviceId && params.platform && params.clientId) {
    const device = await kit.devices.registerDevice({
      deviceId: params.deviceId,
      clientId: params.clientId,
      platform: params.platform,
      ip: params.ip,
      userAgent: params.userAgent,
    });
    await kit.devices.bindDeviceToUser(params.deviceId, params.clientId, user.id);
    devicePk = device.id;
  }

  const { sessionToken, csrfToken, session } = await kit.sessions.createSession({
    userId: user.id,
    clientId: params.clientId,
    devicePk,
    ip: params.ip,
    userAgent: params.userAgent,
  });

  await kit.auth.recordLoginAttempt({
    email: params.email,
    provider: 'email',
    deviceId: params.deviceId,
    success: true,
    ip: params.ip,
    userAgent: params.userAgent,
  });
  await kit.config.hooks.onLogin?.(user, 'email');

  let redirectUrl: string | undefined;
  if (params.pendingState) {
    const pending = await kit.auth.consumePendingContext(params.pendingState);
    if (pending) {
      redirectUrl = (await completePendingAuthorize(kit, user.id, pending)) ?? undefined;
    }
  }

  return { redirectUrl, sessionToken, csrfToken, userId: user.id };
}
