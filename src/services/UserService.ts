import type { Pool } from 'pg';
import type { AuthConfig } from '../config.js';
import { ConflictError, InvalidRequestError } from '../errors.js';
import type { AuthUser, ProviderProfile } from '../types.js';

interface UserRow {
  id: string;
  primary_email: string | null;
  display_name: string | null;
  email_verified: boolean;
  status: AuthUser['status'];
  created_at: Date;
  updated_at: Date;
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: Number(row.id),
    primaryEmail: row.primary_email,
    displayName: row.display_name,
    emailVerified: row.email_verified,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UserService {
  constructor(
    private readonly pool: Pool,
    private readonly config: AuthConfig,
  ) {}

  async findById(id: number): Promise<AuthUser | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, primary_email, display_name, email_verified, status, created_at, updated_at
       FROM auth.users WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, primary_email, display_name, email_verified, status, created_at, updated_at
       FROM auth.users WHERE primary_email = $1`,
      [email.toLowerCase()],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByProviderIdentity(
    provider: string,
    providerSubject: string,
  ): Promise<AuthUser | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT u.id, u.primary_email, u.display_name, u.email_verified, u.status, u.created_at, u.updated_at
       FROM auth.users u
       JOIN auth.user_identities i ON i.user_id = u.id
       WHERE i.provider = $1 AND i.provider_subject = $2`,
      [provider, providerSubject],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async createUser(params: {
    email?: string;
    displayName?: string;
    emailVerified?: boolean;
  }): Promise<AuthUser> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO auth.users (primary_email, display_name, email_verified)
       VALUES ($1, $2, $3)
       RETURNING id, primary_email, display_name, email_verified, status, created_at, updated_at`,
      [
        params.email?.toLowerCase() ?? null,
        params.displayName ?? null,
        params.emailVerified ?? false,
      ],
    );
    const user = mapUser(rows[0]!);
    await this.config.hooks.onUserCreated?.(user);
    return user;
  }

  async linkIdentity(userId: number, profile: ProviderProfile): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.user_identities
         (user_id, provider, provider_subject, email, email_verified, raw_profile)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, provider_subject) DO UPDATE SET
         email = EXCLUDED.email,
         email_verified = EXCLUDED.email_verified,
         raw_profile = EXCLUDED.raw_profile,
         updated_at = now()`,
      [
        userId,
        profile.provider,
        profile.providerSubject,
        profile.email?.toLowerCase() ?? null,
        profile.emailVerified,
        JSON.stringify(profile.rawProfile),
      ],
    );
  }

  async resolveOrCreateFromProvider(profile: ProviderProfile): Promise<AuthUser> {
    const existing = await this.findByProviderIdentity(
      profile.provider,
      profile.providerSubject,
    );
    if (existing) {
      await this.linkIdentity(existing.id, profile);
      return existing;
    }

    if (
      profile.email &&
      this.config.accountLinking.autoLinkVerifiedEmail &&
      profile.emailVerified
    ) {
      const byEmail = await this.findByEmail(profile.email);
      if (byEmail) {
        await this.linkIdentity(byEmail.id, profile);
        return byEmail;
      }
    }

    if (
      profile.email &&
      !profile.emailVerified &&
      this.config.accountLinking.blockUnverifiedEmailLinking
    ) {
      const byEmail = await this.findByEmail(profile.email);
      if (byEmail) {
        throw new ConflictError(
          'An account with this email already exists. Sign in with your existing method first.',
          'email_link_blocked',
        );
      }
    }

    const user = await this.createUser({
      email: profile.email,
      displayName: profile.displayName,
      emailVerified: profile.emailVerified,
    });
    await this.linkIdentity(user.id, profile);
    return user;
  }

  async setPassword(userId: number, passwordHash: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth.password_credentials (user_id, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         password_updated_at = now()`,
      [userId, passwordHash],
    );
  }

  async getPasswordHash(userId: number): Promise<string | null> {
    const { rows } = await this.pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM auth.password_credentials WHERE user_id = $1',
      [userId],
    );
    return rows[0]?.password_hash ?? null;
  }

  async registerWithEmail(params: {
    email: string;
    passwordHash: string;
    displayName?: string;
  }): Promise<AuthUser> {
    const existing = await this.findByEmail(params.email);
    if (existing) {
      throw new ConflictError('Email already registered', 'email_exists');
    }

    const user = await this.createUser({
      email: params.email,
      displayName: params.displayName,
      emailVerified: false,
    });

    await this.setPassword(user.id, params.passwordHash);
    await this.linkIdentity(user.id, {
      provider: 'email',
      providerSubject: params.email.toLowerCase(),
      email: params.email,
      emailVerified: false,
      displayName: params.displayName,
      rawProfile: {},
    });

    return user;
  }
}
