import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import { connect } from 'amqplib';
import type { Environment } from '../config/environment.js';

const TIMEOUT_MS = 2000;

/**
 * `degraded`, never `down`, when RabbitMQ is unreachable: memberships and the ledger are still read and Stripe's events still applied; the outbox
 * keeps the integration events until the broker is back.
 */
@Injectable()
export class RabbitMqHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async isReachable(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const connection = await connect(this.config.get('RABBITMQ_URL', { infer: true }), { timeout: TIMEOUT_MS });
      await connection.close();
      return indicator.up();
    } catch (error) {
      return indicator.degraded(`RabbitMQ unreachable, integration events wait in the outbox: ${(error as Error).message}`);
    }
  }
}
