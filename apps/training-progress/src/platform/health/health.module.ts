import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { PostgresHealthIndicator } from './postgres.health.js';
import { RabbitMqHealthIndicator } from './rabbitmq.health.js';
import { RedisHealthIndicator } from './redis.health.js';

@Module({
  // On SIGTERM, readiness answers 503 for a second before the app stops, so traffic drains.
  imports: [TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 1000 })],
  controllers: [HealthController],
  providers: [PostgresHealthIndicator, RedisHealthIndicator, RabbitMqHealthIndicator],
})
export class HealthModule {}
