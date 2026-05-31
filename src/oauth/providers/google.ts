export function mapGoogleProfile(profile: Record<string, unknown>): {
  providerSubject: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  rawProfile: Record<string, unknown>;
} {
  const sub = profile.sub;
  if (typeof sub !== 'string') {
    throw new Error('Google profile missing sub');
  }
  return {
    providerSubject: sub,
    email: typeof profile.email === 'string' ? profile.email : undefined,
    emailVerified: profile.email_verified === true,
    displayName: typeof profile.name === 'string' ? profile.name : undefined,
    rawProfile: profile,
  };
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce?: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', params.state);
  if (params.nonce) {
    url.searchParams.set('nonce', params.nonce);
  }
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export async function exchangeGoogleCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string; idToken?: string }> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; id_token?: string };
  return { accessToken: data.access_token, idToken: data.id_token };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google userinfo failed: ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}
