import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

function getMigrationsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(currentDir, 'migrations'),
    join(currentDir, '..', 'db', 'migrations'),
    join(currentDir, '..', '..', 'src', 'db', 'migrations'),
  ];
  for (const dir of candidates) {
    try {
      const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
      if (files.length > 0) {
        return dir;
      }
    } catch {
      // try next
    }
  }
  throw new Error('Could not locate auth migration SQL files');
}

export async function runAuthMigrations(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.schema_migrations (
      id bigserial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const migrationsDir = getMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];

  for (const file of files) {
    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM auth.schema_migrations WHERE name = $1',
      [file],
    );
    if (rows.length > 0) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO auth.schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return applied;
}
