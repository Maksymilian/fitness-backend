import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { Test } from '@nestjs/testing';
import { createCache } from 'cache-manager';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { migratedDatabase, type MigratedDatabase } from './support/migrated-database.js';

process.env.DATABASE_URL = 'postgres://unused:unused@localhost:1/unused';
process.env.REDIS_URL = 'redis://localhost:1';
process.env.RABBITMQ_URL = 'amqp://localhost:1';
process.env.OUTBOX_RELAY = 'off';
process.env.MAIL_TRANSPORT = 'file';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.RATE_LIMIT = 'on';
process.env.RATE_LIMIT_PER_MINUTE = '3';
process.env.QUERY_TIMEOUT_MS = '200';

const { AppModule } = await import('../src/app.module.js');
const { configureHttp } = await import('../src/platform/http/configure-http.js');
const { DeadLetterTopology } = await import('../src/platform/messaging/dead-letter-topology.js');
const { RedisLockStore } = await import('../src/platform/cache/redis-lock-store.js');
const { TrainingGoalQueries } = await import('../src/training-progress/training-goals/application/queries/training-goal-queries.js');

/** Section 16: the rate limit (3 requests per minute here) and the timeout of query fields (200 ms here). */
describe('Training Progress: rate limit and timeouts (e2e)', () => {
  let client: MigratedDatabase;
  let app: INestApplication<App>;

  /** Reading training goals never answers, as when PostgreSQL stops answering. */
  const hangingTrainingGoalQueries = { ofMember: () => new Promise(() => {}) };

  // A new application for each test: its rate limit counts from zero.
  beforeEach(async () => {
    client = await migratedDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(drizzle({ client }))
      .overrideProvider(MailTransport)
      .useValue(new InMemoryMailTransport())
      .overrideProvider(CACHE_MANAGER)
      .useValue(createCache())
      .overrideProvider(DeadLetterTopology)
      .useValue({})
      // No Redis: the locks are in memory, for this one instance.
      .overrideProvider(RedisLockStore)
      .useValue({})
      .overrideProvider(TrainingGoalQueries)
      .useValue(hangingTrainingGoalQueries)
      .compile();
    app = configureHttp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await client.close();
  });

  async function graphql(query: string, status = 200) {
    const { body, headers } = await request(app.getHttpServer()).post('/graphql').send({ query }).expect(status);
    return { body, headers };
  }

  it('answers a GraphQL request past the rate limit with 429 and TOO_MANY_REQUESTS, and never limits the health checks', async () => {
    const STREAK = '{ member(id: "ada@example.com") { streak } }';
    for (let i = 0; i < 3; i++) {
      expect((await graphql(STREAK)).body.errors).toBeUndefined();
    }

    const { body, headers } = await graphql(STREAK, 429);
    expect(body.errors[0]).toMatchObject({ path: ['member'], extensions: { code: 'TOO_MANY_REQUESTS', httpStatus: 429 } });
    expect(body.errors[0].extensions.http).toBeUndefined();
    expect(body.errors[0].extensions.retryAfter).toBeGreaterThan(0);
    expect(Number(headers['retry-after'])).toBeGreaterThan(0);
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });

  it('fails a query field with TIMEOUT when it takes longer than the timeout', async () => {
    const started = Date.now();
    const { body } = await graphql('{ member(id: "ada@example.com") { trainingGoals { id } } }');

    expect(body.errors[0]).toMatchObject({ path: ['member', 'trainingGoals'], extensions: { code: 'TIMEOUT', httpStatus: 504 } });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
