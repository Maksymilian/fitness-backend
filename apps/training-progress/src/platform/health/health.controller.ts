import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PostgresHealthIndicator } from './postgres.health.js';
import { RabbitMqHealthIndicator } from './rabbitmq.health.js';
import { RedisHealthIndicator } from './redis.health.js';

/** Kubernetes' probes aren't callers: no rate limit, or a burst of requests would take the instance out. */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly rabbitMq: RabbitMqHealthIndicator,
  ) {}

  /** Alive if the process answers. No dependency checks: a database outage must not restart every instance. */
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /** Ready to take traffic: `down` without PostgreSQL, `degraded` without Redis or RabbitMQ. */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.postgres.isHealthy('postgres'),
      () => this.redis.isReachable('redis'),
      () => this.rabbitMq.isReachable('rabbitmq'),
    ]);
  }
}
