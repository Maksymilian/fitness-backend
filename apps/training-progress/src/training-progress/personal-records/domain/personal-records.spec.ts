import { MemberId } from '../../members/domain/values/member-id.js';
import { Discipline } from '../../training-log/domain/values/discipline.js';
import { LoggedWorkoutId } from '../../training-log/domain/values/logged-workout-id.js';
import { WorkoutMetrics } from '../../training-log/domain/values/workout-metrics.js';
import { PersonalRecordSet } from './events/personal-record-set.js';
import { PersonalRecordWithdrawn } from './events/personal-record-withdrawn.js';
import { PersonalRecords } from './personal-records.js';
import { RecordCandidate } from './values/record-candidate.js';
import { RecordMetric } from './values/record-metric.js';

const now = new Date('2026-10-08T10:00:00Z');
const first = LoggedWorkoutId.from('0199c3a2-0000-7000-8000-000000000101');
const second = LoggedWorkoutId.from('0199c3a2-0000-7000-8000-000000000102');
const firstStart = new Date('2026-10-01T08:00:00Z');
const secondStart = new Date('2026-10-02T08:00:00Z');
function metrics(distanceMeters: number, durationSeconds: number, calories: number) {
  return WorkoutMetrics.of({ distanceMeters, durationSeconds, calories });
}

function adaCycling(): PersonalRecords {
  return PersonalRecords.startFor(MemberId.from('ada@example.com'), Discipline.Cycling);
}

/** Given: the first workout set all three records. */
function withRecordsFromFirstWorkout(): PersonalRecords {
  const records = adaCycling();
  records.consider(first, firstStart, metrics(20_000, 3600, 600), now);
  records.pullDomainEvents();
  return records;
}

describe('PersonalRecords', () => {
  describe('consider', () => {
    it('given no records, sets one per record metric', () => {
      const records = adaCycling();

      records.consider(first, firstStart, metrics(20_000, 3600, 600), now);

      const events = records.pullDomainEvents() as PersonalRecordSet[];
      expect(events.map((event) => [event.record.metric.value, event.record.value])).toEqual([
        ['LONGEST_DISTANCE', 20_000],
        ['LONGEST_DURATION', 3600],
        ['MOST_CALORIES', 600],
      ]);
      expect(events.every((event) => event.previous === null)).toBe(true);
    });

    it('sets only the records a workout beats', () => {
      const records = withRecordsFromFirstWorkout();

      records.consider(second, secondStart, metrics(25_000, 3000, 600), now);

      const [event, ...rest] = records.pullDomainEvents() as PersonalRecordSet[];
      expect(rest).toEqual([]);
      expect(event.record).toMatchObject({ metric: RecordMetric.LongestDistance, value: 25_000, loggedWorkoutId: second, setAt: secondStart });
      expect(event.previous?.value).toBe(20_000);
    });

    it('is idempotent: considering the same workout again changes nothing', () => {
      const records = withRecordsFromFirstWorkout();

      records.consider(first, firstStart, metrics(20_000, 3600, 600), now);

      expect(records.pullDomainEvents()).toEqual([]);
    });

    it('sets no record of zero', () => {
      const records = adaCycling();

      records.consider(first, firstStart, metrics(0, 3600, 0), now);

      expect((records.pullDomainEvents() as PersonalRecordSet[]).map((event) => event.record.metric)).toEqual([RecordMetric.LongestDuration]);
    });
  });

  describe('recalculate', () => {
    const candidate = (metric: RecordMetric, value: number, id = first, startedAt = firstStart) => new RecordCandidate(metric, value, id, startedAt);

    it('withdraws a record whose workout was revised lower, falling back to the next best', () => {
      const records = withRecordsFromFirstWorkout();

      records.recalculate(
        [
          candidate(RecordMetric.LongestDistance, 15_000, second, secondStart),
          candidate(RecordMetric.LongestDuration, 3600),
          candidate(RecordMetric.MostCalories, 600),
        ],
        now,
      );

      const [event, ...rest] = records.pullDomainEvents() as PersonalRecordWithdrawn[];
      expect(rest).toEqual([]);
      expect(event).toBeInstanceOf(PersonalRecordWithdrawn);
      expect(event.withdrawn.value).toBe(20_000);
      expect(event.fallback).toMatchObject({ value: 15_000, loggedWorkoutId: second });
      expect(records.recordOf(RecordMetric.LongestDistance)?.value).toBe(15_000);
    });

    it('withdraws every record when no counting workout is left', () => {
      const records = withRecordsFromFirstWorkout();

      records.recalculate([], now);

      const events = records.pullDomainEvents() as PersonalRecordWithdrawn[];
      expect(events).toHaveLength(3);
      expect(events.every((event) => event instanceof PersonalRecordWithdrawn && event.fallback === null)).toBe(true);
      expect(records.records).toEqual([]);
    });

    it('sets a record when a revision makes a workout beat it', () => {
      const records = withRecordsFromFirstWorkout();

      records.recalculate(
        [candidate(RecordMetric.LongestDistance, 22_000), candidate(RecordMetric.LongestDuration, 3600), candidate(RecordMetric.MostCalories, 600)],
        now,
      );

      expect(records.pullDomainEvents()).toEqual([expect.any(PersonalRecordSet)]);
    });

    it('falls back to another workout with the same value when the holder no longer supports it', () => {
      const records = withRecordsFromFirstWorkout();

      records.recalculate(
        [
          candidate(RecordMetric.LongestDistance, 20_000, second, secondStart),
          candidate(RecordMetric.LongestDuration, 3600),
          candidate(RecordMetric.MostCalories, 600),
        ],
        now,
      );

      const [event] = records.pullDomainEvents() as PersonalRecordWithdrawn[];
      expect(event).toBeInstanceOf(PersonalRecordWithdrawn);
      expect(event.fallback?.loggedWorkoutId).toEqual(second);
    });

    it('changes nothing when the candidates are the records', () => {
      const records = withRecordsFromFirstWorkout();

      records.recalculate(
        [candidate(RecordMetric.LongestDistance, 20_000), candidate(RecordMetric.LongestDuration, 3600), candidate(RecordMetric.MostCalories, 600)],
        now,
      );

      expect(records.pullDomainEvents()).toEqual([]);
    });
  });
});
