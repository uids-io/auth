import type { AuthKit } from '../config.js';
import { UnauthorizedError } from '../errors.js';
import { parseScope, validateAuthorizeParams } from './clients.js';
import type { DevicePlatform, PendingAuthContext } from '../types.js';
import { generateOpaqueToken } from '../crypto/random.js';

export interface AuthorizeResult {
  type: 'redirect_login' | 'redirect_portal';
  url: string;
}

export async function handleAuthorize(
  kit: AuthKit,
  params: {
    query: Record<string, unknown>;
    sessionToken?: string;
    deviceId?: string;
    platform?: DevicePlatform;
  },
): Promise<AuthorizeResult> {
  const parsed = validateAuthorizeParams(params.query);
  const client = await kit.oauthClients.requireClient(parsed.clientId);
  kit.oauthClients.validateRedirectUri(client, parsed.redirectUri);
  kit.oauthClients.validateScopes(client, parsed.scopes);

  if (kit.config.devices.requireDeviceId && !params.deviceId) {
    throw new UnauthorizedError('device_id required', 'device_required');
  }

  let devicePk: number | undefined;
  if (params.deviceId && params.platform) {
    const device = await kit.devices.registerDevice({
      deviceId: params.deviceId,
      clientId: parsed.clientId,
      platform: params.platform,
    });
    devicePk = device.id;
  }

  if (params.sessionToken) {
    const session = await kit.sessions.getSessionByToken(params.sessionToken);
    if (session) {
      const user = await kit.users.findById(session.userId);
      if (user) {
        const code = await kit.tokens.createAuthorizationCode({
          clientId: parsed.clientId,
          userId: user.id,
          redirectUri: parsed.redirectUri,
          scopes: parsed.scopes,
          codeChallenge: parsed.codeChallenge,
          codeChallengeMethod: parsed.codeChallengeMethod,
          state: parsed.state,
          nonce: parsed.nonce,
          devicePk,
        });
        const url = new URL(parsed.redirectUri);
        url.searchParams.set('code', code);
        if (parsed.state) {
          url.searchParams.set('state', parsed.state);
        }
        return { type: 'redirect_portal', url: url.toString() };
      }
    }
  }

  const state = parsed.state ?? generateOpaqueToken(16);
  const pending: PendingAuthContext = {
    type: 'oauth_authorize',
    clientId: parsed.clientId,
    redirectUri: parsed.redirectUri,
    scopes: parsed.scopes,
    state: parsed.state,
    codeChallenge: parsed.codeChallenge,
    codeChallengeMethod: parsed.codeChallengeMethod,
    nonce: parsed.nonce,
    deviceId: params.deviceId,
    platform: params.platform,
  };
  await kit.auth.savePendingContext(state, pending);

  const loginUrl = new URL('/login', kit.config.issuer);
  loginUrl.searchParams.set('state', state);
  return { type: 'redirect_login', url: loginUrl.toString() };
}

export async function completePendingAuthorize(
  kit: AuthKit,
  userId: number,
  pending: PendingAuthContext,
): Promise<string | null> {
  if (pending.type !== 'oauth_authorize' || !pending.clientId || !pending.redirectUri) {
    return null;
  }

  let devicePk: number | undefined;
  if (pending.deviceId && pending.platform) {
    const device = await kit.devices.bindDeviceToUser(
      pending.deviceId,
      pending.clientId,
      userId,
    );
    devicePk = device.id;
  }

  const code = await kit.tokens.createAuthorizationCode({
    clientId: pending.clientId,
    userId,
    redirectUri: pending.redirectUri,
    scopes: pending.scopes ?? parseScope(),
    codeChallenge: pending.codeChallenge!,
    codeChallengeMethod: pending.codeChallengeMethod ?? 'S256',
    state: pending.state,
    nonce: pending.nonce,
    devicePk,
  });

  const url = new URL(pending.redirectUri);
  url.searchParams.set('code', code);
  if (pending.state) {
    url.searchParams.set('state', pending.state);
  }
  return url.toString();
}
