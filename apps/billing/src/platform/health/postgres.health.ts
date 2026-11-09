import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';

/** `down` when the service's own PostgreSQL doesn't answer: without it, nothing works. */
@Injectable()
export class PostgresHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @InjectDrizzle() private readonly db: Database,
  ) {}

  isHealthy(key: string) {
    return this.healthIndicatorService
      .check(key)
      .attempt(async () => {
        await this.db.execute(sql`select 1`);
      })
      .withTimeout(1500);
  }
}
