import { AggregateRoot } from '@app/ddd';
import type { EquipmentId } from '../../equipment/domain/values/equipment-id.js';
import type { EquipmentType } from '../../equipment/domain/values/equipment-type.js';
import type { MemberId } from '../../equipment/domain/values/member-id.js';
import { WorkoutStartedInTheFuture } from './errors/workout-started-in-the-future.js';
import { WorkoutVoided as WorkoutIsVoided } from './errors/workout-voided.js';
import { WorkoutCorrected } from './events/workout-corrected.js';
import type { WorkoutFacts } from './events/workout-facts.interface.js';
import { WorkoutRecorded } from './events/workout-recorded.js';
import { WorkoutVoided } from './events/workout-voided.js';
import { Correction } from './values/correction.js';
import type { CorrectionReason } from './values/correction-reason.js';
import type { Discipline } from './values/discipline.js';
import type { Recording } from './values/recording.js';
import type { RecordingId } from './values/recording-id.js';
import { WorkoutId } from './values/workout-id.js';
import type { WorkoutMetrics } from './values/workout-metrics.js';
import { WorkoutStatus } from './values/workout-status.js';
import type { VoidReason } from './values/void-reason.js';

/** Clock skew between equipment and the platform that a workout's start may have. */
const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** The domain events a workout records. */
export type WorkoutEvent = WorkoutRecorded | WorkoutCorrected | WorkoutVoided;

/** What a workout holds, as the repository saves and reconstitutes it. */
export interface WorkoutProps {
  readonly id: WorkoutId;
  readonly equipmentId: EquipmentId;
  readonly equipmentType: EquipmentType;
  readonly recordingId: RecordingId;
  readonly memberId: MemberId;
  readonly discipline: Discipline;
  readonly startedAt: Date;
  readonly metrics: WorkoutMetrics;
  readonly status: WorkoutStatus;
  /** 1 when recorded, plus 1 for every correction or void. */
  readonly revision: number;
  readonly recordedAt: Date;
  readonly voidReason: VoidReason | null;
  readonly voidedAt: Date | null;
}

/**
 * One continuous exercise session, recorded by equipment. It belongs to the member who was paired
 * with the equipment when it was recorded. Its metrics can be corrected, and it can be voided,
 * until it's voided: a voided workout is kept, never deleted.
 */
export class Workout extends AggregateRoot<WorkoutEvent> {
  private wrappedProps: WorkoutProps;
  private readonly corrections: Correction[] = [];

  private constructor(props: WorkoutProps, version: number) {
    super(version);
    this.wrappedProps = props;
  }

  /**
   * Creates a recorded workout. Only `Equipment.recordWorkout()` calls it: the rules for a new
   * workout (paired equipment, a supported discipline) belong to the equipment.
   */
  static record(params: { equipmentId: EquipmentId; equipmentType: EquipmentType; memberId: MemberId; recording: Recording; now: Date }): Workout {
    const { recording, now } = params;
    if (recording.startedAt.getTime() > now.getTime() + ALLOWED_CLOCK_SKEW_MS) {
      throw new WorkoutStartedInTheFuture(recording.startedAt);
    }
    const workout = new Workout(
      {
        id: WorkoutId.generate(),
        equipmentId: params.equipmentId,
        equipmentType: params.equipmentType,
        recordingId: recording.recordingId,
        memberId: params.memberId,
        discipline: recording.discipline,
        startedAt: recording.startedAt,
        metrics: recording.metrics,
        status: WorkoutStatus.Recorded,
        revision: 1,
        recordedAt: now,
        voidReason: null,
        voidedAt: null,
      },
      0,
    );
    workout.record(new WorkoutRecorded(workout.facts(), now));
    return workout;
  }

  /** Rebuilds a workout from storage. The revision is also its version for optimistic locking. */
  static reconstitute(props: WorkoutProps): Workout {
    return new Workout(props, props.revision);
  }

  get id(): WorkoutId {
    return this.wrappedProps.id;
  }

  get props(): WorkoutProps {
    return this.wrappedProps;
  }

  /** The corrections made since the workout was loaded, for the audit trail. */
  get newCorrections(): readonly Correction[] {
    return this.corrections;
  }

  /** Replaces the metrics, which were wrong. Only while recorded; a reason is required. */
  correct(metrics: WorkoutMetrics, reason: CorrectionReason, now: Date): void {
    this.ensureRecorded();
    const correction = new Correction(this.wrappedProps.revision + 1, this.wrappedProps.metrics, metrics, reason, now);
    this.wrappedProps = { ...this.wrappedProps, metrics, revision: correction.revision };
    this.corrections.push(correction);
    this.record(new WorkoutCorrected(this.facts(), correction));
  }

  /** Marks the workout as not counting, for example because someone else used the equipment. Final. */
  void(reason: VoidReason, now: Date): void {
    this.ensureRecorded();
    this.wrappedProps = {
      ...this.wrappedProps,
      status: WorkoutStatus.Voided,
      revision: this.wrappedProps.revision + 1,
      voidReason: reason,
      voidedAt: now,
    };
    this.record(new WorkoutVoided(this.facts(), reason, now));
  }

  private ensureRecorded(): void {
    if (this.wrappedProps.status.equals(WorkoutStatus.Voided)) {
      throw new WorkoutIsVoided(this.wrappedProps.id.value);
    }
  }

  private facts(): WorkoutFacts {
    const { id, equipmentId, equipmentType, recordingId, memberId, discipline, startedAt, metrics, status, revision } = this.wrappedProps;
    return { workoutId: id, equipmentId, equipmentType, recordingId, memberId, discipline, startedAt, metrics, status, revision };
  }
}
