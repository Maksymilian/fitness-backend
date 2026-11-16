import { AggregateRoot } from '@app/ddd';
import type { MemberId } from '../../members/domain/values/member-id.js';
import type { Discipline } from '../../training-log/domain/values/discipline.js';
import type { LoggedWorkoutId } from '../../training-log/domain/values/logged-workout-id.js';
import type { WorkoutMetrics } from '../../training-log/domain/values/workout-metrics.js';
import { PersonalRecordSet } from './events/personal-record-set.js';
import { PersonalRecordWithdrawn } from './events/personal-record-withdrawn.js';
import { PersonalRecord } from './values/personal-record.js';
import type { RecordCandidate } from './values/record-candidate.js';
import { RecordMetric } from './values/record-metric.js';

/** The domain events a member's personal records record. */
export type PersonalRecordsEvent = PersonalRecordSet | PersonalRecordWithdrawn;

/**
 * All of a member's personal records in one discipline, one per record metric. They change
 * together and only through it. A personal record has to be true, so unlike an achievement it
 * can be withdrawn.
 */
export class PersonalRecords extends AggregateRoot<PersonalRecordsEvent> {
  private readonly wrappedRecords = new Map<RecordMetric, PersonalRecord>();

  private constructor(
    readonly memberId: MemberId,
    readonly discipline: Discipline,
    records: readonly PersonalRecord[],
    version: number,
  ) {
    super(version);
    for (const record of records) {
      this.wrappedRecords.set(record.metric, record);
    }
  }

  /** A member's personal records in a discipline before any workout set one. */
  static startFor(memberId: MemberId, discipline: Discipline): PersonalRecords {
    return new PersonalRecords(memberId, discipline, [], 0);
  }

  static reconstitute(memberId: MemberId, discipline: Discipline, records: readonly PersonalRecord[], version: number): PersonalRecords {
    return new PersonalRecords(memberId, discipline, records, version);
  }

  get records(): readonly PersonalRecord[] {
    return RecordMetric.all.flatMap((metric) => this.wrappedRecords.get(metric) ?? []);
  }

  recordOf(metric: RecordMetric): PersonalRecord | undefined {
    return this.wrappedRecords.get(metric);
  }

  /**
   * Compares a newly logged workout with the records: sets every record it beats. Considering
   * the same workout again changes nothing, because it can't beat itself.
   */
  consider(loggedWorkoutId: LoggedWorkoutId, startedAt: Date, metrics: WorkoutMetrics, now: Date): void {
    for (const metric of RecordMetric.all) {
      const value = metric.of(metrics);
      const current = this.wrappedRecords.get(metric);
      if (value > 0 && (!current || current.isBeatenBy(value))) {
        this.set(new PersonalRecord(metric, value, loggedWorkoutId, startedAt), current ?? null, now);
      }
    }
  }

  /**
   * Sets the records from the record candidates after a revision or a stop-counting: a candidate
   * that beats a record sets it; a record its logged workout no longer supports is withdrawn, and
   * falls back to the candidate, or disappears when there's none.
   */
  recalculate(candidates: readonly RecordCandidate[], now: Date): void {
    for (const metric of RecordMetric.all) {
      const candidate = candidates.find((c) => c.metric.equals(metric) && c.value > 0)?.toPersonalRecord() ?? null;
      const current = this.wrappedRecords.get(metric) ?? null;
      if (!current) {
        if (candidate) this.set(candidate, null, now);
      } else if (!candidate || candidate.value < current.value) {
        this.withdraw(current, candidate, now);
      } else if (candidate.value > current.value) {
        this.set(candidate, current, now);
      } else if (!candidate.loggedWorkoutId.equals(current.loggedWorkoutId)) {
        // Same value from another workout: the holder no longer supports it, the next best does.
        this.withdraw(current, candidate, now);
      }
    }
  }

  private set(record: PersonalRecord, previous: PersonalRecord | null, now: Date): void {
    this.wrappedRecords.set(record.metric, record);
    this.record(new PersonalRecordSet(this.memberId, this.discipline, record, previous, now));
  }

  private withdraw(withdrawn: PersonalRecord, fallback: PersonalRecord | null, now: Date): void {
    if (fallback) {
      this.wrappedRecords.set(withdrawn.metric, fallback);
    } else {
      this.wrappedRecords.delete(withdrawn.metric);
    }
    this.record(new PersonalRecordWithdrawn(this.memberId, this.discipline, withdrawn.metric, withdrawn, fallback, now));
  }
}
