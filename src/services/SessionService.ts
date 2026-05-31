import { createHmac, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthConfig } from '../config.js';
import { generateOpaqueToken } from '../crypto/random.js';
import { hashToken } from '../crypto/tokens.js';
import { UnauthorizedError } from '../errors.js';
import type { SessionRecord, SessionStatus } from '../types.js';

interface SessionRow {
  id: string;
  user_id: string;
  client_id: string | null;
  device_id: string | null;
  status: SessionStatus;
  expires_at: Date;
  csrf_token: string | null;
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    clientId: row.client_id,
    deviceId: row.device_id ? Number(row.device_id) : null,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

export class SessionService {
  constructor(
    private readonly pool: Pool,
    private readonly config: AuthConfig,
  ) {}

  generateCsrfToken(): string {
    return randomBytes(32).toString('base64url');
  }

  async createSession(params: {
    userId: number;
    clientId?: string;
    devicePk?: number;
    userAgent?: string;
    ip?: string;
    ttlSeconds?: number;
  }): Promise<{ session: SessionRecord; sessionToken: string; csrfToken: string }> {
    const sessionToken = generateOpaqueToken(32);
    const sessionTokenHash = hashToken(sessionToken);
    const csrfToken = this.generateCsrfToken();
    const ttl = params.ttlSeconds ?? this.config.token.refreshTokenTtlSeconds;

    const { rows } = await this.pool.query<SessionRow>(
      `INSERT INTO auth.sessions
         (session_token_hash, user_id, client_id, device_id, user_agent, ip, csrf_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7, now() + ($8 || ' seconds')::interval)
       RETURNING id, user_id, client_id, device_id, status, expires_at, csrf_token`,
      [
        sessionTokenHash,
        params.userId,
        params.clientId ?? null,
        params.devicePk ?? null,
        params.userAgent ?? null,
        params.ip ?? null,
        csrfToken,
        ttl,
      ],
    );

    return {
      session: mapSession(rows[0]!),
      sessionToken,
      csrfToken,
    };
  }

  async getSessionByToken(sessionToken: string): Promise<
    (SessionRecord & { csrfToken: string | null }) | null
  > {
    const { rows } = await this.pool.query<SessionRow>(
      `SELECT id, user_id, client_id, device_id, status, expires_at, csrf_token
       FROM auth.sessions
       WHERE session_token_hash = $1 AND status = 'active' AND expires_at > now()`,
      [hashToken(sessionToken)],
    );
    if (!rows[0]) {
      return null;
    }
    return { ...mapSession(rows[0]), csrfToken: rows[0].csrf_token };
  }

  async requireSessionByToken(sessionToken: string): Promise<
    SessionRecord & { csrfToken: string | null }
  > {
    const session = await this.getSessionByToken(sessionToken);
    if (!session) {
      throw new UnauthorizedError('Invalid or expired session', 'invalid_session');
    }
    return session;
  }

  async revokeSession(sessionId: number): Promise<void> {
    await this.pool.query(
      `UPDATE auth.sessions SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [sessionId],
    );
    await this.pool.query(
      `UPDATE auth.refresh_tokens SET revoked_at = now()
       WHERE session_id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  async revokeAllUserSessions(userId: number): Promise<void> {
    await this.pool.query(
      `UPDATE auth.sessions SET status = 'revoked', revoked_at = now()
       WHERE user_id = $1 AND status = 'active'`,
      [userId],
    );
  }

  signSessionCookie(sessionToken: string): string {
    const secret = this.config.csrf?.secret ?? this.config.issuer;
    const sig = createHmac('sha256', secret).update(sessionToken).digest('base64url');
    return `${sessionToken}.${sig}`;
  }

  verifySessionCookie(signed: string): string | null {
    const lastDot = signed.lastIndexOf('.');
    if (lastDot === -1) {
      return null;
    }
    const token = signed.slice(0, lastDot);
    const sig = signed.slice(lastDot + 1);
    const secret = this.config.csrf?.secret ?? this.config.issuer;
    const expected = createHmac('sha256', secret).update(token).digest('base64url');
    if (expected !== sig) {
      return null;
    }
    return token;
  }

  getCookieOptions(maxAgeSeconds?: number): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    domain?: string;
    maxAge?: number;
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.config.cookie.secure,
      sameSite: this.config.cookie.sameSite,
      domain: this.config.cookie.domain,
      maxAge: maxAgeSeconds ? maxAgeSeconds * 1000 : undefined,
      path: '/',
    };
  }
}
