import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';

const CHANGESETS = fileURLToPath(new URL('../../liquibase/changesets/', import.meta.url));

/** The one pool the test queries directly and hands to `drizzle({ client })`, so the app's queries
 * and the test's assertions share the same connection to the Testcontainers database. */
export type MigratedDatabase = Pool & { close(): Promise<void> };

/** A real PostgreSQL (Testcontainers, the image compose.yaml also runs), with the service's
 * Liquibase changesets applied in order. Formatted SQL changesets are plain SQL with comments, so
 * the tests run the very DDL Liquibase runs. The test records (context test-data) are left out. */
export async function migratedDatabase(): Promise<MigratedDatabase> {
  const container = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  const pool = new Pool({ connectionString: container.getConnectionUri() }) as MigratedDatabase;
  try {
    for (const file of readdirSync(CHANGESETS).filter((name) => name.endsWith('.sql')).sort()) {
      await pool.query(readFileSync(join(CHANGESETS, file), 'utf8'));
    }
  } catch (error) {
    await pool.end();
    await container.stop();
    throw error;
  }
  pool.close = async () => {
    await pool.end();
    await container.stop();
  };
  return pool;
}
