import { describe, it, expect } from 'vitest';
import { mapGoogleProfile } from '../../src/oauth/providers/google.js';
import { mapMicrosoftProfile } from '../../src/oauth/providers/microsoft.js';

describe('Google profile mapping', () => {
  it('maps sub to providerSubject', () => {
    const mapped = mapGoogleProfile({
      sub: 'google-sub-123',
      email: 'user@gmail.com',
      email_verified: true,
      name: 'Test User',
    });
    expect(mapped.providerSubject).toBe('google-sub-123');
    expect(mapped.email).toBe('user@gmail.com');
    expect(mapped.emailVerified).toBe(true);
  });
});

describe('Microsoft profile mapping', () => {
  it('maps sub when present', () => {
    const mapped = mapMicrosoftProfile({
      sub: 'ms-sub',
      email: 'user@contoso.com',
      email_verified: true,
    });
    expect(mapped.providerSubject).toBe('ms-sub');
  });

  it('falls back to oid+tid', () => {
    const mapped = mapMicrosoftProfile({
      oid: 'oid-1',
      tid: 'tid-1',
      preferred_username: 'user@contoso.com',
    });
    expect(mapped.providerSubject).toBe('oid-1:tid-1');
    expect(mapped.email).toBe('user@contoso.com');
  });
});
