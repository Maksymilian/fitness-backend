import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { Test } from '@nestjs/testing';
import { createCache } from 'cache-manager';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { migratedDatabase, type MigratedDatabase } from './support/migrated-database.js';
import { buttonPress, buttons, recordingBot, TELEGRAM_WEBHOOK_SECRET, texts, textMessage } from './support/telegram.js';

process.env.DATABASE_URL = 'postgres://unused:unused@localhost:1/unused';
process.env.REDIS_URL = 'redis://localhost:1';
process.env.RABBITMQ_URL = 'amqp://localhost:1';
process.env.OUTBOX_RELAY = 'off';
process.env.MAIL_TRANSPORT = 'file';
process.env.TELEGRAM_BOT_TOKEN = '42:test-token';
process.env.TELEGRAM_UPDATES = 'webhook';
process.env.TELEGRAM_WEBHOOK_URL = 'https://progress.fitness.test/telegram/updates';
process.env.TELEGRAM_WEBHOOK_SECRET = TELEGRAM_WEBHOOK_SECRET;
process.env.RATE_LIMIT_PER_MINUTE = '10000'; // whatever .env says: resilience.e2e-spec.ts covers it
process.env.QUERY_TIMEOUT_MS = '10000';

const { AppModule } = await import('../src/app.module.js');
const { configureHttp } = await import('../src/platform/http/configure-http.js');
const { DeadLetterTopology } = await import('../src/platform/messaging/dead-letter-topology.js');
const { RedisLockStore } = await import('../src/platform/cache/redis-lock-store.js');

describe('Telegram bot (e2e)', () => {
  let client: MigratedDatabase;
  let app: INestApplication<App>;
  const recording = recordingBot();

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
      .overrideProvider(Bot)
      .useValue(recording.bot)
      .compile();
    // rawBody, as in main.ts: the webhook is verified on the bytes Telegram sent.
    app = configureHttp(moduleRef.createNestApplication({ rawBody: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  /** Posts the update as Telegram does, and returns what the bot sent for it. */
  async function post(update: Update, secret = TELEGRAM_WEBHOOK_SECRET) {
    const before = recording.calls.length;
    const response = await request(app.getHttpServer()).post('/telegram/updates').set('x-telegram-bot-api-secret-token', secret).send(update);
    return { status: response.status, sent: recording.calls.slice(before) };
  }

  async function trainingGoals(memberId: string) {
    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `query ($id: ID!) { member(id: $id) { trainingGoals { id status target } } }`, variables: { id: memberId } })
      .expect(200);
    return (body as { data: { member: { trainingGoals: { id: string; status: string; target: number }[] } } }).data.member.trainingGoals;
  }

  it('asks Telegram to post the updates to the webhook, with the secret token', async () => {
    await vi.waitFor(() => expect(recording.calls.map(({ method }) => method)).toContain('setWebhook'));

    expect(recording.calls.find(({ method }) => method === 'setWebhook')?.payload).toMatchObject({
      url: 'https://progress.fitness.test/telegram/updates',
      secret_token: TELEGRAM_WEBHOOK_SECRET,
    });
  });

  it('refuses an update without the secret token, and runs nothing', async () => {
    const { status, sent } = await post(textMessage(101, '/start'), 'a-guessed-token');

    expect(status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('signs a chat in, answers its bot commands for that member, and signs it out', async () => {
    expect(texts((await post(textMessage(102, '/streak'))).sent)).toEqual([expect.stringContaining('Sign in first')]);

    const signedIn = await post(textMessage(102, '/sign_in Grace@Example.com'));
    expect(signedIn.status).toBe(200);
    expect(texts(signedIn.sent)).toEqual([expect.stringMatching(/^Signed in as grace@example\.com\./)]);

    expect(texts((await post(textMessage(102, '/streak'))).sent)).toEqual(['No streak yet: a day with a workout starts one.']);

    await post(textMessage(102, '/sign_out'));
    expect(texts((await post(textMessage(102, '/streak'))).sent)).toEqual([expect.stringContaining('Sign in first')]);
  });

  it('sets a goal from its button once, however often Telegram sends the update', async () => {
    await post(textMessage(103, '/sign_in wizard@example.com'));
    const start = new Date().toISOString().slice(0, 8) + '01';
    const update = buttonPress(103, `set-goal-confirmed:DISTANCE:CYCLING:200000:MONTH:${start}`);

    const first = await post(update);
    const again = await post(update);

    expect(first.status).toBe(200);
    expect(texts(first.sent)).toEqual([expect.stringMatching(/^Goal set:\n\n🚴 200 km of cycling, /)]);
    expect(again).toEqual({ status: 200, sent: [] });
    expect(await trainingGoals('wizard@example.com')).toEqual([{ id: expect.any(String), status: 'ACTIVE', target: 200000 }]);
  });

  it('abandons a goal from the /training_goals buttons, after asking to confirm', async () => {
    await post(textMessage(104, '/sign_in abandon@example.com'));
    const start = new Date().toISOString().slice(0, 8) + '01';
    await post(buttonPress(104, `set-goal-confirmed:WORKOUT_COUNT:ANY:12:MONTH:${start}`));
    const [goal] = await trainingGoals('abandon@example.com');

    const list = await post(textMessage(104, '/training_goals'));
    const confirm = await post(buttonPress(104, buttons(list.sent).find(({ text }) => text.startsWith('Abandon'))!.callback_data));
    await post(buttonPress(104, buttons(confirm.sent).find(({ text }) => text === 'Abandon it')!.callback_data));

    expect(await trainingGoals('abandon@example.com')).toEqual([{ id: goal.id, status: 'ABANDONED', target: 12 }]);
  });

  it("doesn't let a chat abandon another member's goal", async () => {
    await post(textMessage(105, '/sign_in owner@example.com'));
    const start = new Date().toISOString().slice(0, 8) + '01';
    await post(buttonPress(105, `set-goal-confirmed:CALORIES:ANY:5000:MONTH:${start}`));
    const [goal] = await trainingGoals('owner@example.com');
    await post(textMessage(106, '/sign_in someone-else@example.com'));

    const { status, sent } = await post(buttonPress(106, `abandon-confirmed:${goal.id}`));

    expect(status).toBe(200);
    expect(sent.find(({ method }) => method === 'answerCallbackQuery')?.payload).toMatchObject({ text: `Training goal ${goal.id} not found`, show_alert: true });
    expect(await trainingGoals('owner@example.com')).toEqual([{ id: goal.id, status: 'ACTIVE', target: 5000 }]);
  });

  it('ignores group chats', async () => {
    const { status, sent } = await post(textMessage(-107, '/start', { chatType: 'group' }));

    expect(status).toBe(200);
    expect(sent).toEqual([]);
  });
});
