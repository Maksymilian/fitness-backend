import { TelemetryModule, TracedTransport } from '@app/telemetry';
import { Global, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ClientProxyTransport, OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { ResilienceModule } from '@nestjs/resilience';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { isPublishedLanguage, PUBLISHED_LANGUAGE_EXCHANGE } from '../billing/published-language/broker.js';
import { toCloudEvent } from '../billing/published-language/cloud-event.mapper.js';
import { type Environment, validateEnvironment } from './config/environment.js';
import { type Database, withPoolErrorsLogged } from './database/database.js';
import { Transactions } from './database/transactions.js';
import { HealthModule } from './health/health.module.js';
import { DomainErrorFilter } from './http/domain-error.filter.js';
import { RateLimitGuard } from './http/rate-limit.guard.js';
import { CloudEventSerializer } from './messaging/cloud-event.serializer.js';
import { DomainEventPublisher } from './outbox/domain-event-publisher.js';
import { OutboxDomainEventPublisher } from './outbox/outbox-domain-event-publisher.js';
import { RouteTable } from './outbox/route-table.js';
import { billingRoutes } from './outbox/routes.js';
import { StartupTolerantPostgresOutboxStore } from './outbox/startup-tolerant-postgres-outbox-store.js';
import { OutboxAdminModule } from './outbox-admin/outbox-admin.module.js';
import { WebhookVerificationMetrics } from './webhooks/webhook-verification-metrics.js';

/** The RabbitMQ client the outbox relay publishes integration events through. */
export const BILLING_BROKER = 'BILLING_BROKER';

/**
 * Technical plumbing of the service: configuration, the database, the outbox (domain events to the
 * Apply Payment policy, in-process; the published language to RabbitMQ), the rate limit and
 * timeouts, validation, error mapping, health checks. No domain concepts.
 */
@Global()
@Module({
  imports: [
    TelemetryModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: 'apps/billing/.env',
      validate: validateEnvironment,
    }),
    CqrsModule.forRoot(),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      // A pg pool on PostgreSQL instance 3, closed after the relay drained on shutdown. Billing's
      // traffic is a member's own pages and Stripe's events: a small pool.
      useFactory: (config: ConfigService<Environment, true>) => ({
        db: withPoolErrorsLogged(
          drizzle({
            connection: {
              connectionString: config.get('DATABASE_URL', { infer: true }),
              min: 2,
              max: 20,
              connectionTimeoutMillis: 5_000,
              statement_timeout: 15_000,
              application_name: 'billing',
            },
          }),
        ),
      }),
    }),
    OutboxModule.forRootAsync({
      imports: [
        ClientsModule.registerAsync([
          {
            name: BILLING_BROKER,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Environment, true>) => ({
              transport: Transport.RMQ,
              options: {
                urls: [config.get('RABBITMQ_URL', { infer: true })],
                // The published language's topic exchange: each topic is its routing key.
                exchange: PUBLISHED_LANGUAGE_EXCHANGE,
                exchangeType: 'topic',
                wildcards: true,
                // Survive a broker restart. The channel waits for publisher confirms.
                persistent: true,
                // Each message is a CloudEvent in structured content mode.
                serializer: new CloudEventSerializer(),
              },
            }),
          },
        ]),
      ],
      transports: {
        // In the trace of the change that staged the event, which Training Progress continues.
        rabbitmq: TracedTransport(
          ClientProxyTransport(BILLING_BROKER, {
            toPacket: (message) => ({ pattern: message.topic, data: toCloudEvent(message) }),
          }),
        ),
      },
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        // The published language goes to RabbitMQ; the domain events stay in this process, for Apply Payment.
        route: (message) => (isPublishedLanguage(message.topic) ? 'rabbitmq' : 'local'),
        relay: { enabled: config.get('OUTBOX_RELAY', { infer: true }) !== 'off' },
        // The package default, 20 attempts over 30 to 60 minutes: a broker outage doesn't dead-letter events.
        retry: { attempts: 20 },
      }),
    }),
    // The rate limit per caller (section 16), counted in this instance's memory: it applies per instance.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => {
        const off = config.get('RATE_LIMIT', { infer: true }) === 'off';
        return {
          throttlers: [{ ttl: minutes(1), limit: config.get('RATE_LIMIT_PER_MINUTE', { infer: true }) }],
          skipIf: () => off,
        };
      },
    }),
    // Timeouts (section 16): a route with @Timeout() is answered 504 after QUERY_TIMEOUT_MS.
    ResilienceModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({ defaults: { timeout: config.get('QUERY_TIMEOUT_MS', { infer: true }) } }),
    }),
    HealthModule,
    OutboxAdminModule,
  ],
  providers: [
    {
      // Messages and inboxes in this service's database (nest_outbox, Liquibase changeset 0002);
      // the instance starts while PostgreSQL is down.
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) => new StartupTolerantPostgresOutboxStore(db, outboxStorage),
    },
    { provide: RouteTable, useValue: billingRoutes },
    { provide: DomainEventPublisher, useClass: OutboxDomainEventPublisher },
    Transactions,
    WebhookVerificationMetrics,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [Transactions, DomainEventPublisher],
})
export class PlatformModule {}
