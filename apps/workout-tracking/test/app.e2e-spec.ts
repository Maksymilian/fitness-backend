import { WORKOUT_TRACKING_SOURCE, WorkoutTrackingTopics } from '@app/workout-tracking-contracts';
import { ConcurrencyConflict } from '@app/ddd';
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Outbox, OutboxRelay } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { of } from 'rxjs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { migratedDatabase, type MigratedDatabase } from './support/migrated-database.js';

process.env.DATABASE_URL = 'postgres://unused:unused@localhost:1/unused';
process.env.RABBITMQ_URL = 'amqp://localhost:1';
process.env.OUTBOX_RELAY = 'off'; // no poll loop: the tests drive the relay
process.env.ADMIN_TOKEN = 'a-long-admin-token-for-tests';
process.env.RATE_LIMIT_PER_MINUTE = '10000'; // whatever .env says: resilience.e2e-spec.ts covers it
process.env.QUERY_TIMEOUT_MS = '10000';

const { AppModule } = await import('../src/app.module.js');
const { WORKOUT_TRACKING_BROKER } = await import('../src/platform/platform.module.js');
const { configureHttp } = await import('../src/platform/http/configure-http.js');
const { EquipmentRepository } = await import('../src/workout-tracking/equipment/domain/equipment.repository.js');
const { EquipmentId } = await import('../src/workout-tracking/equipment/domain/values/equipment-id.js');
const { MemberId } = await import('../src/workout-tracking/equipment/domain/values/member-id.js');

describe('Workout Tracking (e2e)', () => {
  let client: MigratedDatabase;
  let app: INestApplication<App>;
  let relay: OutboxRelay;
  const broker = { emit: vi.fn(() => of(undefined)) };
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    client = await migratedDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(drizzle({ client })) // the outbox store runs on it too
      .overrideProvider(WORKOUT_TRACKING_BROKER)
      .useValue(broker)
      .compile();
    app = configureHttp(moduleRef.createNestApplication());
    await app.init();
    relay = app.get(OutboxRelay);
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  beforeEach(() => broker.emit.mockClear());

  async function registerBike(serialNumber: string) {
    const { body } = await api().post('/internal/v1/equipment').send({ serialNumber, type: 'BIKE' }).expect(201);
    return body.id as string;
  }

  async function pairedBike(serialNumber: string, memberId = 'ada@example.com') {
    const equipmentId = await registerBike(serialNumber);
    await api().put(`/internal/v1/equipment/${equipmentId}/pairing`).send({ memberId }).expect(200);
    return equipmentId;
  }

  const ride = (recordingId: string, startedAt = '2026-10-08T08:30:00.000Z') => ({
    recordingId,
    discipline: 'CYCLING',
    startedAt,
    durationSeconds: 2700,
    distanceMeters: 18200,
    calories: 530,
  });

  describe('equipment', () => {
    it('registers, pairs and unpairs equipment', async () => {
      const equipmentId = await registerBike('bk-e2e-1');

      const paired = await api().put(`/internal/v1/equipment/${equipmentId}/pairing`).send({ memberId: 'Ada@Example.com' }).expect(200);
      expect(paired.body).toMatchObject({ serialNumber: 'BK-E2E-1', type: 'BIKE', pairedMemberId: 'ada@example.com' });

      await api().delete(`/internal/v1/equipment/${equipmentId}/pairing`).expect(204);
      const { body } = await api().get(`/internal/v1/equipment/${equipmentId}`).expect(200);
      expect(body.pairedMemberId).toBeNull();
    });

    it('refuses a serial number that is already registered (409), whatever its case', async () => {
      await registerBike('BK-E2E-2');

      const { body } = await api().post('/internal/v1/equipment').send({ serialNumber: 'bk-e2e-2', type: 'BIKE' }).expect(409);
      expect(body.code).toBe('SerialNumberAlreadyRegistered');
    });

    it('refuses pairing with another member while paired (409)', async () => {
      const equipmentId = await pairedBike('BK-E2E-3');

      await api().put(`/internal/v1/equipment/${equipmentId}/pairing`).send({ memberId: 'grace@example.com' }).expect(409);
    });

    it('answers 404 for unknown equipment and 400 for malformed input', async () => {
      await api().get('/internal/v1/equipment/0199c3a2-0000-7000-8000-00000000ffff').expect(404);
      await api().get('/internal/v1/equipment/not-a-uuid').expect(400);
      await api().post('/internal/v1/equipment').send({ serialNumber: 'BK-1', type: 'ELLIPTICAL' }).expect(400);
      await api().post('/internal/v1/equipment').send({ serialNumber: 'BK-1', type: 'BIKE', extra: 1 }).expect(400);
    });

    it('catches a concurrent change with optimistic locking', async () => {
      const equipmentId = EquipmentId.from(await registerBike('BK-E2E-4'));
      const repository = app.get(EquipmentRepository);
      const first = await repository.get(equipmentId);
      const second = await repository.get(equipmentId);
      const transactions = (await import('../src/platform/database/transactions.js')).Transactions;

      first.pair(MemberId.from('ada@example.com'), new Date());
      await app.get(transactions).run((tx) => repository.save(tx, first));
      second.pair(MemberId.from('grace@example.com'), new Date());

      await expect(app.get(transactions).run((tx) => repository.save(tx, second))).rejects.toThrow(ConcurrencyConflict);
    });
  });

  describe('recording workouts', () => {
    it('records a workout and publishes workout-recorded.v1, as a CloudEvent, only after the commit', async () => {
      const equipmentId = await pairedBike('BK-E2E-10');

      const { body: workout } = await api().post(`/internal/v1/equipment/${equipmentId}/recordings`).send(ride('rec-1')).expect(201);
      expect(workout).toMatchObject({ memberId: 'ada@example.com', status: 'RECORDED', revision: 1, equipmentType: 'BIKE' });
      expect(broker.emit).not.toHaveBeenCalled();

      await relay.runOnce();

      expect(broker.emit).toHaveBeenCalledWith(
        WorkoutTrackingTopics.workoutRecordedV1,
        expect.objectContaining({
          specversion: '1.0',
          id: expect.any(String),
          source: WORKOUT_TRACKING_SOURCE,
          type: WorkoutTrackingTopics.workoutRecordedV1,
          subject: workout.id,
          time: expect.any(String),
          datacontenttype: 'application/json',
          partitionkey: 'ada@example.com',
          data: {
            workoutId: workout.id,
            memberId: 'ada@example.com',
            equipmentType: 'BIKE',
            discipline: 'CYCLING',
            startedAt: '2026-10-08T08:30:00.000Z',
            durationSeconds: 2700,
            distanceMeters: 18200,
            calories: 530,
            status: 'RECORDED',
            revision: 1,
          },
        }),
      );
    });

    it('answers a duplicate recording with the existing workout (200) and publishes nothing new', async () => {
      const equipmentId = await pairedBike('BK-E2E-11');
      const { body: first } = await api().post(`/internal/v1/equipment/${equipmentId}/recordings`).send(ride('rec-1')).expect(201);
      await relay.runOnce();
      broker.emit.mockClear();

      const { body: again } = await api().post(`/internal/v1/equipment/${equipmentId}/recordings`).send(ride('rec-1')).expect(200);

      expect(again.id).toBe(first.id);
      await relay.runOnce();
      expect(broker.emit).not.toHaveBeenCalled();
    });

    it('refuses a recording from unpaired equipment (409) or of an unsupported discipline (422)', async () => {
      const unpaired = await registerBike('BK-E2E-12');
      await api().post(`/internal/v1/equipment/${unpaired}/recordings`).send(ride('rec-1')).expect(409);

      const paired = await pairedBike('BK-E2E-13');
      const { body } = await api()
        .post(`/internal/v1/equipment/${paired}/recordings`)
        .send({ ...ride('rec-1'), discipline: 'ROWING' })
        .expect(422);
      expect(body.code).toBe('DisciplineNotSupported');
    });

    it('refuses invalid metrics (422) and a start in the future (422)', async () => {
      const equipmentId = await pairedBike('BK-E2E-14');

      await api()
        .post(`/internal/v1/equipment/${equipmentId}/recordings`)
        .send({ ...ride('rec-1'), durationSeconds: 0 })
        .expect(422);
      await api()
        .post(`/internal/v1/equipment/${equipmentId}/recordings`)
        .send(ride('rec-2', new Date(Date.now() + 60 * 60 * 1000).toISOString()))
        .expect(422);
    });

    it('publishes nothing when the transaction rolls back', async () => {
      const equipmentId = await pairedBike('BK-E2E-15');
      await relay.runOnce();
      const outbox = app.get(Outbox);
      const add = outbox.add.bind(outbox);
      vi.spyOn(outbox, 'add').mockImplementationOnce(async (tx, messages) => {
        await add(tx, messages); // the messages are written...
        throw new Error('Connection terminated unexpectedly'); // ...then the transaction fails
      });

      await api().post(`/internal/v1/equipment/${equipmentId}/recordings`).send(ride('rec-1')).expect(500);

      expect(await relay.runOnce()).toMatchObject({ claimed: 0 });
      const { rows } = await client.query(`select count(*)::int as count from workouts where recording_id = 'rec-1' and equipment_id = $1`, [equipmentId]);
      expect(rows).toEqual([{ count: 0 }]);
    });
  });

  describe('corrections and voids', () => {
    async function recordedWorkout(serialNumber: string) {
      const equipmentId = await pairedBike(serialNumber);
      const { body } = await api().post(`/internal/v1/equipment/${equipmentId}/recordings`).send(ride('rec-1')).expect(201);
      await relay.runOnce();
      broker.emit.mockClear();
      return body.id as string;
    }

    it('corrects a workout, keeps the correction as an audit trail and publishes workout-corrected.v1', async () => {
      const workoutId = await recordedWorkout('BK-E2E-20');

      const { body } = await api()
        .post(`/internal/v1/workouts/${workoutId}/corrections`)
        .send({ durationSeconds: 2700, distanceMeters: 21000, calories: 600, reason: 'GPS drift' })
        .expect(200);

      expect(body).toMatchObject({ distanceMeters: 21000, revision: 2 });
      const audit = await client.query(`select revision, reason, previous_metrics from workout_corrections where workout_id = $1`, [workoutId]);
      expect(audit.rows).toEqual([{ revision: 2, reason: 'GPS drift', previous_metrics: { durationSeconds: 2700, distanceMeters: 18200, calories: 530 } }]);
      await relay.runOnce();
      expect(broker.emit).toHaveBeenCalledWith(
        WorkoutTrackingTopics.workoutCorrectedV1,
        expect.objectContaining({ subject: workoutId, data: expect.objectContaining({ distanceMeters: 21000, revision: 2 }) }),
      );
    });

    it('voids a workout, keeps it, and refuses to correct or void it again (409)', async () => {
      const workoutId = await recordedWorkout('BK-E2E-21');

      const { body } = await api().post(`/internal/v1/workouts/${workoutId}/void`).send({ reason: 'Someone else rode' }).expect(200);
      expect(body).toMatchObject({ status: 'VOIDED', revision: 2, voidReason: 'Someone else rode' });

      await api()
        .post(`/internal/v1/workouts/${workoutId}/corrections`)
        .send({ durationSeconds: 60, distanceMeters: 1, calories: 1, reason: 'typo' })
        .expect(409);
      await api().post(`/internal/v1/workouts/${workoutId}/void`).send({ reason: 'again' }).expect(409);
      await api().get(`/internal/v1/workouts/${workoutId}`).expect(200);
      await relay.runOnce();
      expect(broker.emit).toHaveBeenCalledWith(WorkoutTrackingTopics.workoutVoidedV1, expect.anything());
    });

    it('requires a reason (400 when missing)', async () => {
      const workoutId = await recordedWorkout('BK-E2E-22');

      await api().post(`/internal/v1/workouts/${workoutId}/void`).send({}).expect(400);
    });
  });

  describe("a member's workouts", () => {
    it('lists them newest first, a page at a time', async () => {
      const equipmentId = await pairedBike('BK-E2E-30', 'linus@example.com');
      for (const [recordingId, startedAt] of [
        ['a', '2026-10-01T08:00:00.000Z'],
        ['b', '2026-10-02T08:00:00.000Z'],
        ['c', '2026-10-03T08:00:00.000Z'],
      ]) {
        await api().post(`/internal/v1/equipment/${equipmentId}/recordings`).send(ride(recordingId, startedAt)).expect(201);
      }

      const first = await api().get('/internal/v1/members/linus@example.com/workouts?limit=2').expect(200);
      expect(first.body.workouts.map((w: { recordingId: string }) => w.recordingId)).toEqual(['c', 'b']);

      const second = await api()
        .get(`/internal/v1/members/linus@example.com/workouts?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`)
        .expect(200);
      expect(second.body).toMatchObject({ workouts: [expect.objectContaining({ recordingId: 'a' })], nextCursor: null });
    });
  });

  describe('operations', () => {
    it('is alive, and ready but degraded while RabbitMQ is unreachable', async () => {
      await api().get('/health/live').expect(200);

      const { body } = await api().get('/health/ready').expect(200);
      expect(body).toMatchObject({ status: 'degraded', info: { postgres: { status: 'up' }, rabbitmq: { status: 'degraded' } } });
    });

    it('protects the dead-letter routes with the admin token', async () => {
      await api().get('/internal/v1/admin/outbox/dead-letters').expect(403);
      await api().get('/internal/v1/admin/outbox/dead-letters').set('x-admin-token', 'a-long-admin-token-for-tests').expect(200, []);
    });

    it('keeps the outbox schema at the version Liquibase applied', async () => {
      const { rows } = await client.query(`select max(version)::int as version from nest_outbox.migrations`);
      expect(rows).toEqual([{ version: 1 }]);
    });
  });

  describe('HTTP', () => {
    it('sends the security headers on every response, errors included, and no CORS headers', async () => {
      const { headers } = await api().get(`/internal/v1/equipment/${uuidv7()}`).set('Origin', 'https://elsewhere.example').expect(404);

      expect(headers).toMatchObject({
        'content-security-policy': expect.stringContaining("default-src 'self'"),
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
      });
      expect(headers['x-powered-by']).toBeUndefined();
      expect(headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
