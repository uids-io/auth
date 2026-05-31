import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { runAuthMigrations } from '../../src/db/migrations.js';
import { seedDefaultPortalClients } from '../../src/services/OAuthClientService.js';

let container: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;

export async function setupTestDb(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await runAuthMigrations(pool);
  await seedDefaultPortalClients(pool, {
    merchantRedirectUris: ['https://merchant.example.com/auth/callback'],
    agencyRedirectUris: ['https://agency.example.com/auth/callback'],
    influencerRedirectUris: ['https://influencer.example.com/auth/callback'],
    adminRedirectUris: ['https://admin.example.com/auth/callback'],
  });
  return pool;
}

export async function teardownTestDb(): Promise<void> {
  await pool?.end();
  await container?.stop();
  pool = undefined;
  container = undefined;
}

export async function createTestAuthKit() {
  const testPool = await setupTestDb();
  const { createAuthKit } = await import('../../src/config.js');
  return createAuthKit({
    issuer: 'https://auth.example.com',
    apiAudience: 'https://api.example.com',
    pg: testPool,
    cookie: {
      name: 'uids_auth_session',
      secure: false,
      sameSite: 'lax',
    },
    csrf: { secret: 'test-csrf-secret-key-32chars!' },
    email: {
      sendMagicLink: async () => {},
    },
  });
}
