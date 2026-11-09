import { Logger } from '@nestjs/common';
import type { OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';

/**
 * The outbox store, in this service's database, in a schema of its own (nest_outbox). Liquibase
 * creates and migrates that schema, so the store never does.
 *
 * The package's store fails the startup when it can't check its schema. Here, a database that
 * doesn't answer yet doesn't: the instance starts, liveness answers, readiness stays `down`, and the
 * store checks its schema at its first call instead (the relay's next poll). A database that answers
 * with a schema that's behind, or the wrong isolation level, still fails the startup.
 */
export class StartupTolerantPostgresOutboxStore extends PostgresOutboxStore {
  private readonly startupLogger = new Logger('OutboxModule');

  constructor(
    private readonly db: Database,
    storage: OutboxStorage,
  ) {
    super({ executor: fromDrizzle(db), migrate: false }, storage);
  }

  override async onModuleInit(): Promise<void> {
    try {
      await this.db.execute(sql`select 1`);
    } catch (error) {
      this.startupLogger.warn(`PostgreSQL unreachable, the outbox store checks its schema at its first call: ${(error as Error).message}`);
      return;
    }
    await super.onModuleInit();
  }
}
