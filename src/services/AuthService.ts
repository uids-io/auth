import type { Pool } from 'pg';
import type { AuthConfig } from '../config.js';
import { RateLimitError } from '../errors.js';
import type { DeviceService } from './DeviceService.js';
import type { SessionService } from './SessionService.js';
import type { TokenService } from './TokenService.js';
import type { UserService } from './UserService.js';
import type { PendingAuthContext } from '../types.js';

export class AuthService {
  constructor(
    private readonly pool: Pool,
    private readonly config: AuthConfig,
    private readonly users: UserService,
    private readonly devices: DeviceService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
  ) {}

  async checkRateLimit(key: string): Promise<void> {
    if (!this.config.rateLimiter) {
      return;
    }
    const result = await this.config.rateLimiter.check(key);
    if (!result.allowed) {
      throw new RateLimitError('Too many requests', result.retryAfterSeconds);
    }
  }

  async recordLoginAttempt(params: {
    email?: string;
    provider?: string;
    deviceId?: string;
    success: boolean;
    ip?: string;
    userAgent?: string;
    failureReason?: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.login_attempts
         (email, provider, device_id, success, ip, user_agent, failure_reason)
       VALUES ($1, $2, $3, $4, $5::inet, $6, $7)`,
      [
        params.email?.toLowerCase() ?? null,
        params.provider ?? null,
        params.deviceId ?? null,
        params.success,
        params.ip ?? null,
        params.userAgent ?? null,
        params.failureReason ?? null,
      ],
    );
  }

  async savePendingContext(state: string, context: PendingAuthContext, ttlSeconds = 600): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.pending_auth_context (state, context, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
       ON CONFLICT (state) DO UPDATE SET context = EXCLUDED.context, expires_at = EXCLUDED.expires_at`,
      [state, JSON.stringify(context), ttlSeconds],
    );
  }

  async consumePendingContext(state: string): Promise<PendingAuthContext | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ context: PendingAuthContext; expires_at: Date }>(
        `SELECT context, expires_at FROM auth.pending_auth_context
         WHERE state = $1 FOR UPDATE`,
        [state],
      );
      if (!rows[0] || new Date(rows[0].expires_at) <= new Date()) {
        await client.query('DELETE FROM auth.pending_auth_context WHERE state = $1', [state]);
        await client.query('COMMIT');
        return null;
      }
      await client.query('DELETE FROM auth.pending_auth_context WHERE state = $1', [state]);
      await client.query('COMMIT');
      return rows[0].context;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.query(`DELETE FROM auth.pending_auth_context WHERE expires_at <= now()`);
    await this.pool.query(
      `DELETE FROM auth.oauth_authorization_codes WHERE expires_at <= now() AND consumed_at IS NULL`,
    );
    await this.pool.query(`DELETE FROM auth.magic_links WHERE expires_at <= now() AND consumed_at IS NULL`);
  }
}
