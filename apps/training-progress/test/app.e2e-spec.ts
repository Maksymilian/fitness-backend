import { BILLING_SOURCE, BillingTopics } from '@app/billing-contracts';
import { WORKOUT_TRACKING_SOURCE, WorkoutTrackingTopics } from '@app/workout-tracking-contracts';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { OutboxRelay } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import { createCache } from 'cache-manager';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { migratedDatabase, type MigratedDatabase } from './support/migrated-database.js';

process.env.DATABASE_URL = 'postgres://unused:unused@localhost:1/unused';
process.env.REDIS_URL = 'redis://localhost:1';
process.env.RABBITMQ_URL = 'amqp://localhost:1';
process.env.OUTBOX_RELAY = 'off'; // no poll loop: the tests drive the relay
process.env.MAIL_TRANSPORT = 'file';
process.env.TELEGRAM_BOT_TOKEN = ''; // the bot is off, whatever .env says: telegram.e2e-spec.ts covers it
process.env.RATE_LIMIT_PER_MINUTE = '10000'; // whatever .env says: resilience.e2e-spec.ts covers it
process.env.QUERY_TIMEOUT_MS = '10000';
process.env.CORS_ORIGINS = 'https://app.fitness.example,http://localhost:5173';

const { AppModule } = await import('../src/app.module.js');
const { configureHttp } = await import('../src/platform/http/configure-http.js');
const { DeadLetterTopology } = await import('../src/platform/messaging/dead-letter-topology.js');
const { RedisLockStore } = await import('../src/platform/cache/redis-lock-store.js');
const { CloudEventDeserializer } = await import('../src/platform/messaging/cloud-event.deserializer.js');
const { WorkoutTrackingEventsController } = await import('../src/training-progress/workout-tracking-acl/workout-tracking-events.controller.js');
const { BillingEventsController } = await import('../src/training-progress/billing-acl/billing-events.controller.js');
const { MissEndedGoalsCommand } = await import('../src/training-progress/training-goals/application/commands/miss-ended-goals.command.js');
const { ScheduleTriggersController } = await import('../src/training-progress/training-goals/interface/schedule/schedule-triggers.controller.js');
const { ScheduleTriggers } = await import('../src/platform/messaging/schedule-triggers.js');
const { PersonalRecordMail } = await import('../src/notifications/personal-record.mail.js');
const { GoalAchievedMail } = await import('../src/notifications/goal-achieved.mail.js');

type Topic = (typeof WorkoutTrackingTopics)[keyof typeof WorkoutTrackingTopics];

describe('Training Progress (e2e)', () => {
  let client: MigratedDatabase;
  let app: INestApplication<App>;
  let relay: OutboxRelay;
  let cache: Cache;
  const mailbox = new InMemoryMailTransport();

  beforeAll(async () => {
    client = await migratedDatabase();
    cache = createCache(); // in memory: Redis itself is covered by the health and fallback tests
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(drizzle({ client }))
      .overrideProvider(MailTransport)
      .useValue(mailbox)
      .overrideProvider(CACHE_MANAGER)
      .useValue(cache)
      .overrideProvider(DeadLetterTopology)
      .useValue({})
      // No Redis: the locks are in memory, for this one instance.
      .overrideProvider(RedisLockStore)
      .useValue({})
      .compile();
    app = configureHttp(moduleRef.createNestApplication());
    await app.init();
    relay = app.get(OutboxRelay);
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  beforeEach(() => mailbox.clear());

  /** Publishes every committed message, including the ones the handlers add, until none is left. */
  async function drainOutbox() {
    for (let round = 0; round < 10; round++) {
      const { claimed } = await relay.runOnce();
      if (claimed === 0) return;
    }
    throw new Error('the outbox did not drain');
  }

  /**
   * Delivers an integration event to the anticorruption layer the way RabbitMQ does: a CloudEvent in
   * structured content mode, read by the deserializer, whose pattern picks the handler. Reports the ack.
   */
  async function deliver(topic: Topic, payload: Record<string, unknown>, id = uuidv7()) {
    const channel = { ack: vi.fn(), nack: vi.fn() };
    const message = { content: Buffer.from('') };
    const context = { getChannelRef: () => channel, getMessage: () => message };
    const cloudEvent = {
      specversion: '1.0',
      id,
      source: WORKOUT_TRACKING_SOURCE,
      type: topic,
      subject: String(payload.workoutId),
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      partitionkey: String(payload.memberId),
      data: payload,
    };
    const { pattern, data } = new CloudEventDeserializer().deserialize(cloudEvent, { contentType: 'application/cloudevents+json; charset=utf-8' });
    const acl = app.get(WorkoutTrackingEventsController);
    const handle = {
      [WorkoutTrackingTopics.workoutRecordedV1]: () => acl.workoutRecorded(data, context),
      [WorkoutTrackingTopics.workoutCorrectedV1]: () => acl.workoutCorrected(data, context),
      [WorkoutTrackingTopics.workoutVoidedV1]: () => acl.workoutVoided(data, context),
    }[pattern as Topic];
    await handle();
    return { id, acked: channel.ack.mock.calls.length === 1, nack: channel.nack.mock.calls[0] as [unknown, boolean, boolean] | undefined };
  }

  function snapshot(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      workoutId: uuidv7(),
      memberId: 'ada@example.com',
      equipmentType: 'BIKE',
      discipline: 'CYCLING',
      startedAt: '2026-10-08T08:30:00.000Z',
      durationSeconds: 2700,
      distanceMeters: 18200,
      calories: 530,
      status: 'RECORDED',
      revision: 1,
      ...overrides,
    };
  }

  async function graphql<T = Record<string, unknown>>(query: string, variables: Record<string, unknown> = {}) {
    const { body } = await request(app.getHttpServer()).post('/graphql').send({ query, variables }).expect(200);
    return body as { data: T; errors?: { message: string; extensions: { code: string } }[] };
  }

  const TRAINING_LOG = `query ($id: ID!) { member(id: $id) { trainingLog(first: 10) { edges { node { id distanceMeters } } } } }`;
  const PERSONAL_RECORDS = `query ($id: ID!) { member(id: $id) { personalRecords(discipline: CYCLING) { metric value loggedWorkout { id } } } }`;

  describe('anticorruption layer', () => {
    it('logs a recorded workout once, however often it is delivered', async () => {
      const workout = snapshot({ memberId: 'acl-once@example.com' });

      const first = await deliver(WorkoutTrackingTopics.workoutRecordedV1, workout);
      const again = await deliver(WorkoutTrackingTopics.workoutRecordedV1, workout, first.id);

      expect(first.acked && again.acked).toBe(true);
      const { data } = await graphql<{ member: { trainingLog: { edges: unknown[] } } }>(TRAINING_LOG, { id: 'acl-once@example.com' });
      expect(data.member.trainingLog.edges).toEqual([{ node: { id: workout.workoutId, distanceMeters: 18200 } }]);
      const { rows } = await client.query(`select count(*)::int as count from nest_outbox.messages where topic = 'training-progress.domain.workout-logged.v1' and key = 'acl-once@example.com'`);
      expect(rows).toEqual([{ count: 1 }]);
    });

    it('revises a logged workout, and ignores a correction older than the stored revision', async () => {
      const workout = snapshot({ memberId: 'acl-revise@example.com' });
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, workout);

      await deliver(WorkoutTrackingTopics.workoutCorrectedV1, { ...workout, distanceMeters: 30000, revision: 3 });
      await deliver(WorkoutTrackingTopics.workoutCorrectedV1, { ...workout, distanceMeters: 25000, revision: 2 });

      const { data } = await graphql<{ member: { trainingLog: { edges: { node: { distanceMeters: number } }[] } } }>(TRAINING_LOG, { id: 'acl-revise@example.com' });
      expect(data.member.trainingLog.edges[0].node.distanceMeters).toBe(30000);
    });

    it('logs a correction that overtook its recording, then ignores the late recording', async () => {
      const workout = snapshot({ memberId: 'acl-order@example.com' });

      await deliver(WorkoutTrackingTopics.workoutCorrectedV1, { ...workout, distanceMeters: 21000, revision: 2 });
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, workout);

      const { data } = await graphql<{ member: { trainingLog: { edges: { node: { distanceMeters: number } }[] } } }>(TRAINING_LOG, { id: 'acl-order@example.com' });
      expect(data.member.trainingLog.edges).toEqual([{ node: { id: workout.workoutId, distanceMeters: 21000 } }]);
    });

    it('stops counting a voided workout, also when the void came first', async () => {
      const voidedLater = snapshot({ memberId: 'acl-void@example.com' });
      const voidedFirst = snapshot({ memberId: 'acl-void@example.com', startedAt: '2026-10-07T08:30:00.000Z' });
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, voidedLater);

      await deliver(WorkoutTrackingTopics.workoutVoidedV1, { ...voidedLater, status: 'VOIDED', revision: 2 });
      await deliver(WorkoutTrackingTopics.workoutVoidedV1, { ...voidedFirst, status: 'VOIDED', revision: 2 });
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, voidedFirst);

      const { data } = await graphql<{ member: { trainingLog: { edges: unknown[] } } }>(TRAINING_LOG, { id: 'acl-void@example.com' });
      expect(data.member.trainingLog.edges).toEqual([]);
    });

    it('dead-letters an event that breaks the contract instead of retrying it', async () => {
      const result = await deliver(WorkoutTrackingTopics.workoutRecordedV1, snapshot({ discipline: 'SWIMMING' }));

      expect(result.acked).toBe(false);
      expect(result.nack?.[2]).toBe(false); // requeue: false, so RabbitMQ dead-letters it
    });
  });

  describe('personal records and notifications', () => {
    it('sets personal records from a logged workout and notifies the member once per record', async () => {
      const workout = snapshot({ memberId: 'grace@example.com', discipline: 'CYCLING' });
      const { id } = await deliver(WorkoutTrackingTopics.workoutRecordedV1, workout);
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, workout, id); // a redelivery

      await drainOutbox();

      const { data } = await graphql<{ member: { personalRecords: { metric: string; value: number }[] } }>(PERSONAL_RECORDS, { id: 'grace@example.com' });
      expect(data.member.personalRecords.map(({ metric, value }) => [metric, value])).toEqual([
        ['LONGEST_DISTANCE', 18200],
        ['LONGEST_DURATION', 2700],
        ['MOST_CALORIES', 530],
      ]);
      expect(mailbox.filter({ mail: PersonalRecordMail, to: 'grace@example.com' })).toHaveLength(3);
      const mail = mailbox.assertSent({ to: 'grace@example.com', subject: 'New personal record: longest distance in cycling' });
      expect(mail.text).toContain('18.2 km');
    });

    it('withdraws a record when its workout is revised lower, falling back to the next best', async () => {
      const member = 'records-revise@example.com';
      const best = snapshot({ memberId: member, distanceMeters: 30000, startedAt: '2026-10-02T08:00:00.000Z' });
      const second = snapshot({ memberId: member, distanceMeters: 20000, startedAt: '2026-10-03T08:00:00.000Z' });
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, best);
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, second);
      await drainOutbox();

      await deliver(WorkoutTrackingTopics.workoutCorrectedV1, { ...best, distanceMeters: 10000, revision: 2 });
      await drainOutbox();

      const { data } = await graphql<{ member: { personalRecords: { metric: string; value: number; loggedWorkout: { id: string } }[] } }>(PERSONAL_RECORDS, { id: member });
      expect(data.member.personalRecords.find((record) => record.metric === 'LONGEST_DISTANCE')).toEqual({
        metric: 'LONGEST_DISTANCE',
        value: 20000,
        loggedWorkout: { id: second.workoutId },
      });
    });
  });

  describe('training goals', () => {
    const SET_GOAL = `mutation ($input: SetTrainingGoalInput!) { setTrainingGoal(input: $input) { id status target progress } }`;
    const GOALS = `query ($id: ID!) { member(id: $id) { trainingGoals { id status progress achievedAt } } }`;
    // Goal periods relative to today: a period that has already ended is refused (GoalPeriod).
    const DAY = 24 * 60 * 60 * 1000;
    const today = new Date().setUTCHours(0, 0, 0, 0);
    const daysFromNow = (days: number) => new Date(today + days * DAY);
    const period = { startsOn: daysFromNow(-30).toISOString(), endsOn: daysFromNow(30).toISOString() };

    it('counts workouts already logged when a goal is set, and achieves it when progress reaches the target', async () => {
      const member = 'goals@example.com';
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, snapshot({ memberId: member, distanceMeters: 120000, startedAt: new Date(daysFromNow(-20).getTime() + 8 * 60 * 60 * 1000).toISOString() }));
      await drainOutbox();

      const set = await graphql<{ setTrainingGoal: { id: string; status: string; progress: number } }>(SET_GOAL, {
        input: { memberId: member, metric: 'DISTANCE', target: 200000, discipline: 'CYCLING', ...period },
      });
      expect(set.data.setTrainingGoal).toMatchObject({ status: 'ACTIVE', progress: 120000 });

      await deliver(WorkoutTrackingTopics.workoutRecordedV1, snapshot({ memberId: member, distanceMeters: 90000, startedAt: new Date(daysFromNow(-10).getTime() + 8 * 60 * 60 * 1000).toISOString() }));
      await drainOutbox();

      const { data } = await graphql<{ member: { trainingGoals: { status: string; progress: number }[] } }>(GOALS, { id: member });
      expect(data.member.trainingGoals).toEqual([expect.objectContaining({ status: 'ACHIEVED', progress: 210000 })]);
      mailbox.assertSent({ to: member, mail: GoalAchievedMail });
    });

    it('lists only the goals set at or after setSince', async () => {
      const member = 'set-since@example.com';
      const GOALS_SET_SINCE = `query ($id: ID!, $setSince: DateTime) { member(id: $id) { trainingGoals(setSince: $setSince) { id } } }`;
      const set = await graphql<{ setTrainingGoal: { id: string } }>(SET_GOAL, {
        input: { memberId: member, metric: 'WORKOUT_COUNT', target: 5, ...period },
      });
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const inAnHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const sinceWeekAgo = await graphql<{ member: { trainingGoals: { id: string }[] } }>(GOALS_SET_SINCE, { id: member, setSince: weekAgo });
      expect(sinceWeekAgo.data.member.trainingGoals).toEqual([{ id: set.data.setTrainingGoal.id }]);

      const sinceInAnHour = await graphql<{ member: { trainingGoals: { id: string }[] } }>(GOALS_SET_SINCE, { id: member, setSince: inAnHour });
      expect(sinceInAnHour.data.member.trainingGoals).toEqual([]);
    });

    it('refuses an invalid goal with INVARIANT_VIOLATION and malformed input with BAD_REQUEST', async () => {
      const invalid = await graphql(SET_GOAL, {
        input: { memberId: 'goals@example.com', metric: 'DISTANCE', target: 0, ...period },
      });
      expect(invalid.errors?.[0].extensions.code).toBe('INVARIANT_VIOLATION');

      const malformed = await graphql(SET_GOAL, {
        input: { memberId: 'not-an-email', metric: 'DISTANCE', target: 1, ...period },
      });
      expect(malformed.errors?.[0].extensions.code).toBe('BAD_REQUEST');
    });

    it("lets only the goal's member abandon an active goal", async () => {
      const ABANDON = `mutation ($input: AbandonTrainingGoalInput!) { abandonTrainingGoal(input: $input) { status } }`;
      const set = await graphql<{ setTrainingGoal: { id: string } }>(SET_GOAL, {
        input: { memberId: 'abandon@example.com', metric: 'WORKOUT_COUNT', target: 5, ...period },
      });
      const trainingGoalId = set.data.setTrainingGoal.id;

      const stranger = await graphql(ABANDON, { input: { memberId: 'grace@example.com', trainingGoalId } });
      expect(stranger.errors?.[0].extensions.code).toBe('NOT_FOUND');

      const abandoned = await graphql<{ abandonTrainingGoal: { status: string } }>(ABANDON, { input: { memberId: 'abandon@example.com', trainingGoalId } });
      expect(abandoned.data.abandonTrainingGoal.status).toBe('ABANDONED');

      const again = await graphql(ABANDON, { input: { memberId: 'abandon@example.com', trainingGoalId } });
      expect(again.errors?.[0].extensions.code).toBe('CONFLICT');
    });

    it('misses active goals once their grace period has ended', async () => {
      await graphql(SET_GOAL, {
        input: { memberId: 'miss@example.com', metric: 'CALORIES', target: 99999, ...period },
      });

      const missEndedGoals = (now: string) => app.get(CommandBus).execute(new MissEndedGoalsCommand(new Date(now)));
      const endsOn = new Date(period.endsOn).getTime();
      expect(await missEndedGoals(new Date(endsOn + DAY / 2).toISOString())).toBe(0);
      expect(await missEndedGoals(new Date(endsOn + DAY + 1000).toISOString())).toBeGreaterThanOrEqual(1);
      expect(await missEndedGoals(new Date(endsOn + DAY + 1000).toISOString())).toBe(0); // a second trigger changes nothing

      const { data } = await graphql<{ member: { trainingGoals: { status: string }[] } }>(GOALS, { id: 'miss@example.com' });
      expect(data.member.trainingGoals).toEqual([expect.objectContaining({ status: 'MISSED' })]);
    });

    it("routes the schedule trigger, a structured-mode CloudEvent, to Miss Ended Goals, and acks it", async () => {
      const channel = { ack: vi.fn(), nack: vi.fn() };
      const message = { content: Buffer.from('') };
      const trigger = { specversion: '1.0', id: uuidv7(), source: '/scheduler', type: ScheduleTriggers.types.missEndedGoalsV1, time: new Date().toISOString() };
      const { pattern, data } = new CloudEventDeserializer().deserialize(trigger, { contentType: 'application/cloudevents+json; charset=utf-8' });
      expect(pattern).toBe(ScheduleTriggers.types.missEndedGoalsV1);

      await app.get(ScheduleTriggersController).missEndedGoals(data, { getChannelRef: () => channel, getMessage: () => message });

      expect(channel.ack).toHaveBeenCalledWith(message);
    });
  });

  describe("goal allowance (Billing's memberships)", () => {
    const SET_GOAL = `mutation ($input: SetTrainingGoalInput!) { setTrainingGoal(input: $input) { id status } }`;
    const goal = (memberId: string) => ({ input: { memberId, metric: 'WORKOUT_COUNT', target: 5, startsOn: '2026-10-01T00:00:00Z', endsOn: '2027-01-01T00:00:00Z' } });

    /** Delivers one of Billing's integration events to the anticorruption layer, as RabbitMQ does. */
    async function membership(topic: string, memberId: string, revision: number) {
      const channel = { ack: vi.fn(), nack: vi.fn() };
      const context = { getChannelRef: () => channel, getMessage: () => ({}) };
      const status = topic === BillingTopics.membershipStartedV1 ? 'ACTIVE' : 'ENDED';
      const event = {
        specversion: '1.0',
        id: uuidv7(),
        source: BILLING_SOURCE,
        type: topic,
        datacontenttype: 'application/json',
        partitionkey: memberId,
        data: { membershipId: '0199c3a2-0000-7000-8000-000000000999', memberId, plan: 'MONTHLY', status, paidThrough: '2026-12-01T00:00:00.000Z', renews: true, revision },
      };
      const acl = app.get(BillingEventsController);
      await (topic === BillingTopics.membershipStartedV1 ? acl.membershipStarted(event, context) : acl.membershipEnded(event, context));
      return channel.ack.mock.calls.length === 1;
    }

    it('permits one active goal without a membership, any number with one, and one again once it ended', async () => {
      const member = 'allowance@example.com';
      expect((await graphql(SET_GOAL, goal(member))).errors).toBeUndefined();
      expect((await graphql(SET_GOAL, goal(member))).errors?.[0].extensions.code).toBe('CONFLICT');

      expect(await membership(BillingTopics.membershipStartedV1, member, 1)).toBe(true);
      expect((await graphql(SET_GOAL, goal(member))).errors).toBeUndefined();

      expect(await membership(BillingTopics.membershipEndedV1, member, 2)).toBe(true);
      expect((await graphql(SET_GOAL, goal(member))).errors?.[0].extensions.code).toBe('CONFLICT');
      const { data } = await graphql<{ member: { trainingGoals: unknown[] } }>(`query ($id: ID!) { member(id: $id) { trainingGoals(status: ACTIVE) { id } } }`, { id: member });
      expect(data.member.trainingGoals).toHaveLength(2); // the goals set are kept
    });

    it("ignores a membership's start that arrives after its end", async () => {
      const member = 'late-start@example.com';
      await membership(BillingTopics.membershipEndedV1, member, 2);
      await membership(BillingTopics.membershipStartedV1, member, 1);

      expect((await graphql(SET_GOAL, goal(member))).errors).toBeUndefined();
      expect((await graphql(SET_GOAL, goal(member))).errors?.[0].extensions.code).toBe('CONFLICT');
    });
  });

  describe('progress summaries and streaks', () => {
    const SUMMARY = `query ($id: ID!, $date: DateTime) { member(id: $id) { progressSummary(period: WEEK, date: $date) { periodStart periodEnd workoutCount totalDistanceMeters } } }`;

    it('sums the counting workouts of the week, and invalidates the cached summary when a workout is logged', async () => {
      const member = 'summary@example.com';
      await deliver(WorkoutTrackingTopics.workoutRecordedV1, snapshot({ memberId: member, startedAt: '2026-10-06T08:00:00.000Z' }));
      await drainOutbox();

      const first = await graphql<{ member: { progressSummary: { workoutCount: number; periodStart: string } } }>(SUMMARY, { id: member, date: '2026-10-08T12:00:00Z' });
      expect(first.data.member.progressSummary).toMatchObject({ periodStart: '2026-10-05T00:00:00.000Z', workoutCount: 1 });

      await deliver(WorkoutTrackingTopics.workoutRecordedV1, snapshot({ memberId: member, startedAt: '2026-10-07T08:00:00.000Z' }));
      await drainOutbox(); // the cache invalidation handler deletes the week's keys

      const second = await graphql<{ member: { progressSummary: { workoutCount: number; totalDistanceMeters: number } } }>(SUMMARY, { id: member, date: '2026-10-08T12:00:00Z' });
      expect(second.data.member.progressSummary).toMatchObject({ workoutCount: 2, totalDistanceMeters: 36400 });
    });

    it('counts the streak of consecutive active days up to today', async () => {
      const member = 'streak@example.com';
      const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
      for (const daysAgo of [0, 1, 2, 4]) {
        await deliver(WorkoutTrackingTopics.workoutRecordedV1, snapshot({ memberId: member, startedAt: day(daysAgo) }));
      }

      const { data } = await graphql<{ member: { streak: number } }>(`query ($id: ID!) { member(id: $id) { streak } }`, { id: member });
      expect(data.member.streak).toBe(3);
    });

    it('answers from PostgreSQL when the cache fails', async () => {
      vi.spyOn(cache, 'get').mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const { data, errors } = await graphql<{ member: { progressSummary: { workoutCount: number } } }>(SUMMARY, { id: 'summary@example.com', date: '2026-10-08T12:00:00Z' });

      expect(errors).toBeUndefined();
      expect(data.member.progressSummary.workoutCount).toBe(2);
    });
  });

  describe('operations', () => {
    it('is alive, and ready but degraded while RabbitMQ is unreachable', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200);

      const { body } = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(body).toMatchObject({ status: 'degraded', info: { postgres: { status: 'up' }, redis: { status: 'up' }, rabbitmq: { status: 'degraded' } } });
    });

    it('validates the member id as an email address', async () => {
      const { errors } = await graphql(`query { member(id: "not-an-email") { id } }`);

      expect(errors?.[0].extensions.code).toBe('BAD_REQUEST');
    });
  });

  describe('HTTP', () => {
    const api = () => request(app.getHttpServer());
    const STREAK = { query: '{ member(id: "ada@example.com") { streak } }' };

    it('sends the security headers on every response, and lets GraphiQL load outside production', async () => {
      const { headers } = await api().post('/graphql').send(STREAK).expect(200);

      expect(headers).toMatchObject({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN' });
      expect(headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline' https://unpkg.com");
      expect(headers['x-powered-by']).toBeUndefined();
    });

    it('lets the web apps in CORS_ORIGINS call GraphQL from a browser, and read Retry-After', async () => {
      const preflight = await api()
        .options('/graphql')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,baggage')
        .expect(204);
      expect(preflight.headers).toMatchObject({
        'access-control-allow-origin': 'http://localhost:5173',
        'access-control-allow-methods': 'GET,POST',
        'access-control-allow-headers': 'content-type,baggage',
        'access-control-max-age': '600',
      });

      const { headers } = await api().post('/graphql').set('Origin', 'https://app.fitness.example').send(STREAK).expect(200);
      expect(headers['access-control-allow-origin']).toBe('https://app.fitness.example');
      expect(headers['access-control-expose-headers']).toContain('Retry-After');
    });

    it('gives other origins no CORS headers, so that browsers block them', async () => {
      const { headers } = await api().post('/graphql').set('Origin', 'https://elsewhere.example').send(STREAK).expect(200);

      expect(headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
