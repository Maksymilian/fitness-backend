import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { ReadCache } from '../cache/read-cache.js';

/** `degraded`, never `down`, when Redis is unreachable: reads fall back to PostgreSQL. */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly cache: ReadCache,
  ) {}

  async isReachable(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.cache.ping();
      return indicator.up();
    } catch (error) {
      return indicator.degraded(`Redis unreachable, reading from PostgreSQL: ${(error as Error).message}`);
    }
  }
}
