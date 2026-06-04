import { newDb, DataType, type IMemoryDb } from 'pg-mem';
import type { Pool } from 'pg';
import { runAuthMigrations } from '../../src/db/migrations.js';
import { seedDefaultPortalClients } from '../../examples/express-auth-server/seedPortalClients.js';

let pool: Pool | undefined;
let memoryDb: IMemoryDb | undefined;
let container: { stop: () => Promise<void> } | undefined;
let setupPromise: Promise<Pool> | undefined;

async function setupPgMem(): Promise<Pool> {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    implementation: () => 'auth_test',
  });

  db.public.registerFunction({
    name: 'version',
    implementation: () => 'PostgreSQL 16.0 pg-mem',
  });

  db.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
  });

  const { Pool: MemPool } = db.adapters.createPg();
  const memPool = new MemPool();

  await runAuthMigrations(memPool, { testMode: true });
  await seedDefaultPortalClients(memPool, {
    merchantRedirectUris: ['https://merchant.example.com/auth/callback'],
    agencyRedirectUris: ['https://agency.example.com/auth/callback'],
    influencerRedirectUris: ['https://influencer.example.com/auth/callback'],
    adminRedirectUris: ['https://admin.example.com/auth/callback'],
  });

  memoryDb = db;
  return memPool;
}

async function setupTestcontainers(): Promise<Pool> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const { Pool: PgPool } = await import('pg');

  const pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
  const pgPool = new PgPool({ connectionString: pgContainer.getConnectionUri() });

  await runAuthMigrations(pgPool);
  await seedDefaultPortalClients(pgPool, {
    merchantRedirectUris: ['https://merchant.example.com/auth/callback'],
    agencyRedirectUris: ['https://agency.example.com/auth/callback'],
    influencerRedirectUris: ['https://influencer.example.com/auth/callback'],
    adminRedirectUris: ['https://admin.example.com/auth/callback'],
  });

  container = {
    stop: async () => {
      await pgPool.end();
      await pgContainer.stop();
    },
  };

  return pgPool;
}

async function setupExternalPostgres(connectionString: string): Promise<Pool> {
  const { Pool: PgPool } = await import('pg');
  const pgPool = new PgPool({ connectionString });

  await runAuthMigrations(pgPool);
  await seedDefaultPortalClients(pgPool, {
    merchantRedirectUris: ['https://merchant.example.com/auth/callback'],
    agencyRedirectUris: ['https://agency.example.com/auth/callback'],
    influencerRedirectUris: ['https://influencer.example.com/auth/callback'],
    adminRedirectUris: ['https://admin.example.com/auth/callback'],
  });

  container = {
    stop: async () => {
      await pgPool.end();
    },
  };

  return pgPool;
}

export async function setupTestDb(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  if (!setupPromise) {
    setupPromise = (async () => {
      const externalUrl = process.env.TEST_DATABASE_URL;
      if (externalUrl) {
        pool = await setupExternalPostgres(externalUrl);
        return pool;
      }

      if (process.env.USE_TESTCONTAINERS === '1') {
        try {
          pool = await setupTestcontainers();
          return pool;
        } catch (error) {
          console.warn('Testcontainers unavailable, falling back to pg-mem:', error);
        }
      }

      pool = await setupPgMem();
      return pool;
    })();
  }

  return setupPromise;
}

export async function teardownTestDb(): Promise<void> {
  if (container) {
    await container.stop();
    container = undefined;
  } else if (pool) {
    await pool.end();
  }
  pool = undefined;
  memoryDb = undefined;
  setupPromise = undefined;
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

export function getTestDbBackend(): 'pg-mem' | 'postgres' | 'testcontainers' {
  if (process.env.TEST_DATABASE_URL) {
    return 'postgres';
  }
  if (process.env.USE_TESTCONTAINERS === '1' && container) {
    return 'testcontainers';
  }
  return 'pg-mem';
}
