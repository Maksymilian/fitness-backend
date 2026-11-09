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
process.env.RATE_LIMIT = 'off'; // whatever .env says: the default is checked below
process.env.RATE_LIMIT_PER_MINUTE = '3';

const { AppModule } = await import('../src/app.module.js');
const { configureHttp } = await import('../src/platform/http/configure-http.js');
const { validateEnvironment } = await import('../src/platform/config/environment.js');
const { DeadLetterTopology } = await import('../src/platform/messaging/dead-letter-topology.js');
const { RedisLockStore } = await import('../src/platform/cache/redis-lock-store.js');

/** Section 16.1: without RATE_LIMIT=on (in AWS, WAF limits callers in front of the service), nothing is limited here. */
describe('Training Progress: rate limit off (e2e)', () => {
  let client: MigratedDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
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
      .compile();
    app = configureHttp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  it('is off unless RATE_LIMIT=on', () => {
    const environment = validateEnvironment({ DATABASE_URL: 'postgres://localhost/db', REDIS_URL: 'redis://localhost', RABBITMQ_URL: 'amqp://localhost' });
    expect(environment.RATE_LIMIT).toBe('off');
  });

  it('answers every GraphQL request past RATE_LIMIT_PER_MINUTE, without the rate limit headers', async () => {
    for (let i = 0; i < 5; i++) {
      const { body, headers } = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: '{ member(id: "ada@example.com") { streak } }' })
        .expect(200);
      expect(body.errors).toBeUndefined();
      expect(headers['x-ratelimit-limit']).toBeUndefined();
    }
  });
});
