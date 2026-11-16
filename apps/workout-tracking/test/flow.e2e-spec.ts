import { FLOW_ID } from '@app/telemetry';
import { WorkoutTrackingTopics } from '@app/workout-tracking-contracts';
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { context, propagation, ROOT_CONTEXT } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CBaggagePropagator } from '@opentelemetry/core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { of } from 'rxjs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { migratedDatabase, type MigratedDatabase } from './support/migrated-database.js';

process.env.DATABASE_URL = 'postgres://unused:unused@localhost:1/unused';
process.env.RABBITMQ_URL = 'amqp://localhost:1';
process.env.OUTBOX_RELAY = 'off';
process.env.RATE_LIMIT = 'off';

const { AppModule } = await import('../src/app.module.js');
const { WORKOUT_TRACKING_BROKER } = await import('../src/platform/platform.module.js');
const { configureHttp } = await import('../src/platform/http/configure-http.js');

/**
 * Section 15: the flow FlowMiddleware starts for a request without baggage is still the active one
 * once Nest's body parser has read the body, so the outbox message the request stages carries it.
 * Only the context manager and the baggage propagator of instrumentation.ts are needed for that.
 */
describe('Workout Tracking: flow (e2e)', () => {
  let client: MigratedDatabase;
  let app: INestApplication<App>;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(new W3CBaggagePropagator());
    client = await migratedDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(drizzle({ client }))
      .overrideProvider(WORKOUT_TRACKING_BROKER)
      .useValue({ emit: () => of(undefined) })
      .compile();
    app = configureHttp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await client.close();
    propagation.disable();
    context.disable();
  });

  it('keeps a request without baggage in its new flow past the body parser, up to the outbox message', async () => {
    const { body: equipment } = await api().post('/internal/v1/equipment').send({ serialNumber: 'BK-FLOW-1', type: 'BIKE' }).expect(201);
    await api().put(`/internal/v1/equipment/${equipment.id}/pairing`).send({ memberId: 'ada@example.com' }).expect(200);

    await api()
      .post(`/internal/v1/equipment/${equipment.id}/recordings`)
      .send({
        recordingId: 'rec-flow-1',
        discipline: 'CYCLING',
        startedAt: '2026-10-08T08:30:00.000Z',
        durationSeconds: 2700,
        distanceMeters: 18200,
        calories: 530,
      })
      .expect(201);

    const { rows } = await client.query<{ headers: Record<string, string> }>('SELECT headers FROM nest_outbox.messages WHERE topic = $1', [
      WorkoutTrackingTopics.workoutRecordedV1,
    ]);
    expect(rows).toHaveLength(1);
    const baggage = propagation.getBaggage(propagation.extract(ROOT_CONTEXT, rows[0].headers));
    expect(baggage?.getEntry(FLOW_ID)?.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
