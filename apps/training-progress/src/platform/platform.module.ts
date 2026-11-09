import { TelemetryModule } from '@app/telemetry';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { GraphQLModule } from '@nestjs/graphql';
import { LocksModule } from '@nestjs/locks';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { ResilienceModule } from '@nestjs/resilience';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { CacheInvalidationHandler } from './cache/cache-invalidation.handler.js';
import { ReadCache } from './cache/read-cache.js';
import { RedisLockStore } from './cache/redis-lock-store.js';
import { redisStore } from './cache/redis-store.js';
import { type Environment, validateEnvironment } from './config/environment.js';
import { type Database, withPoolErrorsLogged } from './database/database.js';
import { Transactions } from './database/transactions.js';
import { DomainErrorFilter } from './errors/domain-error.filter.js';
import { RateLimitFilter } from './errors/rate-limit.filter.js';
import { GraphqlOperationMetricsPlugin } from './graphql/graphql-operation-metrics.plugin.js';
import { HealthModule } from './health/health.module.js';
import { RateLimitGuard } from './http/rate-limit.guard.js';
import { DeadLetterTopology } from './messaging/dead-letter-topology.js';
import { DomainEventPublisher } from './outbox/domain-event-publisher.js';
import { OutboxDomainEventPublisher } from './outbox/outbox-domain-event-publisher.js';
import { RouteTable } from './outbox/route-table.js';
import { trainingProgressRoutes } from './outbox/routes.js';
import { StartupTolerantPostgresOutboxStore } from './outbox/startup-tolerant-postgres-outbox-store.js';
import { OutboxAdminModule } from './outbox-admin/outbox-admin.module.js';
import { TelegramModule } from './telegram/telegram.module.js';

/**
 * Technical plumbing of the service: configuration, the database, the outbox (domain events to
 * the policies, the published language to Notifications, all in-process), Redis (the read cache
 * and its locks), GraphQL, scheduling, RabbitMQ topology, the rate limit and timeouts, validation,
 * error mapping, health checks, the Telegram bot. No domain concepts.
 */
@Global()
@Module({
  imports: [
    TelemetryModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: 'apps/training-progress/.env',
      validate: validateEnvironment,
    }),
    CqrsModule.forRoot(),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      // A pg pool on PostgreSQL instance 2, closed after the relay drained on shutdown.
      useFactory: (config: ConfigService<Environment, true>) => ({
        db: withPoolErrorsLogged(
          drizzle({
            connection: {
              connectionString: config.get('DATABASE_URL', { infer: true }),
              min: 2,
              max: 30,
              connectionTimeoutMillis: 5_000,
              statement_timeout: 15_000,
              application_name: 'training-progress',
            },
          }),
        ),
      }),
    }),
    OutboxModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        // Every message is handled in this process: policies, cache invalidation, Notifications.
        relay: { enabled: config.get('OUTBOX_RELAY', { infer: true }) !== 'off' },
      }),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      // Redis only: an in-memory tier couldn't be invalidated from another instance.
      useFactory: (config: ConfigService<Environment, true>) => ({ stores: [redisStore(config.get('REDIS_URL', { infer: true }))] }),
    }),
    // Locks every instance shares, in Redis (RedisLockStore): the read cache's load lock (section 8.1).
    LocksModule.forRoot(),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Code first: the schema is generated from the resolvers and types, in memory.
      autoSchemaFile: true,
      sortSchema: true,
      path: '/graphql',
      // Interceptors run on field resolvers too, where the queries are: @Timeout() covers each field.
      fieldResolverEnhancers: ['interceptors'],
      // An error's extensions.http.status becomes the response's: only the rate limit sets it (429,
      // RateLimitFilter). The driver would answer 200 whenever execution ran; field errors (TIMEOUT,
      // domain errors) set no extensions.http, so they still answer 200.
      preserveHttpStatusForExecutionErrors: false,
    }),
    // The rate limit per caller (section 16), counted in this instance's memory: it applies per instance.
    // Only with RATE_LIMIT=on; off (the default), every request passes, uncounted: in AWS, WAF limits callers.
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
    // Timeouts (section 16): a query field with @Timeout() fails with TIMEOUT after QUERY_TIMEOUT_MS.
    ResilienceModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({ defaults: { timeout: config.get('QUERY_TIMEOUT_MS', { infer: true }) } }),
    }),
    HealthModule,
    OutboxAdminModule,
    TelegramModule,
  ],
  providers: [
    {
      // Messages and inboxes in this service's database (nest_outbox, migrated by Liquibase); the
      // instance starts while PostgreSQL is down.
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) => new StartupTolerantPostgresOutboxStore(db, outboxStorage),
    },
    { provide: RouteTable, useValue: trainingProgressRoutes },
    { provide: DomainEventPublisher, useClass: OutboxDomainEventPublisher },
    Transactions,
    ReadCache,
    RedisLockStore,
    CacheInvalidationHandler,
    DeadLetterTopology,
    // Picked up by Apollo (@Plugin()): GraphQL's per-operation metric.
    GraphqlOperationMetricsPlugin,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
    { provide: APP_FILTER, useClass: RateLimitFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [Transactions, DomainEventPublisher, ReadCache, TelegramModule],
})
export class PlatformModule {}
