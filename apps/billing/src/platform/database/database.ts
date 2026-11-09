import type { Transaction } from '@app/ddd';
import { Logger } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

/** Billing's Drizzle database (PostgreSQL instance 3). */
export type Database = NodePgDatabase;

/**
 * Logs what the pool reports about its idle connections. When PostgreSQL restarts or fails over,
 * each idle connection's error reaches the pool, and an unhandled one would end the process. The
 * pool drops that connection and opens a new one at the next query, so the service reconnects.
 */
export function withPoolErrorsLogged<T extends Database & { $client: Pool }>(db: T): T {
  const logger = new Logger('Database');
  db.$client.on('error', (error) => logger.warn(`Idle PostgreSQL connection lost, the pool reconnects: ${error.message}`));
  return db;
}

/** The `tx` that `db.transaction()` hands its callback. */
export type DrizzleTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Opens the transaction the domain only knows as an opaque `Transaction`. */
export function drizzleTransaction(tx: Transaction): DrizzleTransaction {
  return tx as unknown as DrizzleTransaction;
}

/** Whether `error` is PostgreSQL's unique violation of the named constraint. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (error as { cause?: unknown })?.cause ?? error;
  const pgError = cause as { code?: string; constraint?: string };
  return pgError?.code === '23505' && pgError.constraint === constraint;
}
