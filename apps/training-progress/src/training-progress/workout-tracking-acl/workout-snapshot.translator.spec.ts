import type { CloudEventV1 } from 'cloudevents';
import { InvalidIntegrationEvent } from './invalid-integration-event.js';
import { WorkoutSnapshotTranslator } from './workout-snapshot.translator.js';

function cloudEvent(data: Record<string, unknown>, attributes: Record<string, unknown> = {}): CloudEventV1<unknown> {
  return {
    specversion: '1.0',
    id: '01a0f335-aae8-7027-b795-ca9dab21e44d',
    source: '/workout-tracking',
    type: 'workout-tracking.integration.workout-recorded.v1',
    subject: typeof data.workoutId === 'string' ? data.workoutId : undefined,
    time: '2026-10-08T09:30:12.000Z',
    datacontenttype: 'application/json',
    partitionkey: 'ada@example.com',
    data,
    ...attributes,
  };
}

const snapshot = {
  workoutId: '0199c3a2-0000-7000-8000-000000000101',
  memberId: 'ada@example.com',
  equipmentType: 'BIKE',
  discipline: 'CYCLING',
  startedAt: '2026-10-08T08:30:00.000Z',
  durationSeconds: 2700,
  distanceMeters: 18200,
  calories: 530,
  status: 'RECORDED',
  revision: 1,
};

describe('WorkoutSnapshotTranslator', () => {
  const translator = new WorkoutSnapshotTranslator();

  it("translates the snapshot into this context's types", async () => {
    const workout = await translator.translate(cloudEvent(snapshot));

    expect(workout.loggedWorkoutId.value).toBe(snapshot.workoutId);
    expect(workout.memberId.value).toBe('ada@example.com');
    expect(workout.discipline.value).toBe('CYCLING');
    expect(workout.startedAt).toEqual(new Date(snapshot.startedAt));
    expect(workout.metrics.distance.meters).toBe(18200);
    expect(workout.sourceRevision.value).toBe(1);
  });

  it('refuses data that breaks the contract', async () => {
    await expect(translator.translate(cloudEvent({ ...snapshot, discipline: 'SWIMMING' }))).rejects.toThrow(InvalidIntegrationEvent);
    await expect(translator.translate(cloudEvent({ ...snapshot, revision: 0 }))).rejects.toThrow(InvalidIntegrationEvent);
    await expect(translator.translate(cloudEvent({}))).rejects.toThrow(InvalidIntegrationEvent);
  });

  it('refuses a CloudEvent without an id, which the inbox needs, though the SDK would make one up', async () => {
    await expect(translator.translate(cloudEvent(snapshot, { id: '' }))).rejects.toThrow('the CloudEvent has no id');
    await expect(translator.translate(cloudEvent(snapshot, { id: undefined }))).rejects.toThrow('the CloudEvent has no id');
  });

  it('refuses what breaks the CloudEvents specification', async () => {
    await expect(translator.translate(cloudEvent(snapshot, { specversion: undefined }))).rejects.toThrow('not a CloudEvent 1.0');
    await expect(translator.translate(cloudEvent(snapshot, { specversion: '0.3' }))).rejects.toThrow('not a CloudEvent 1.0');
    await expect(translator.translate(cloudEvent(snapshot, { time: 'yesterday' }))).rejects.toThrow('time must match format "date-time"');
    await expect(translator.translate(cloudEvent(snapshot, { source: undefined }))).rejects.toThrow("must have required property 'source'");
  });

  it("refuses a CloudEvent that isn't from Workout Tracking", async () => {
    await expect(translator.translate(cloudEvent(snapshot, { source: '/billing' }))).rejects.toThrow('the source is /billing, not /workout-tracking');
  });
});
