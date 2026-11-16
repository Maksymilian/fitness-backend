import { AggregateRoot } from '@app/ddd';
import type { MemberId } from '../../members/domain/values/member-id.js';
import { LoggedWorkoutRevised } from './events/logged-workout-revised.js';
import { LoggedWorkoutStoppedCounting } from './events/logged-workout-stopped-counting.js';
import { WorkoutLogged } from './events/workout-logged.js';
import type { Discipline } from './values/discipline.js';
import type { LoggedWorkoutId } from './values/logged-workout-id.js';
import type { SourceRevision } from './values/source-revision.js';
import type { WorkoutMetrics } from './values/workout-metrics.js';

/** The domain events a logged workout records. */
export type LoggedWorkoutEvent = WorkoutLogged | LoggedWorkoutRevised | LoggedWorkoutStoppedCounting;

/** What a logged workout holds, as the repository saves and reconstitutes it. */
export interface LoggedWorkoutProps {
  readonly id: LoggedWorkoutId;
  readonly memberId: MemberId;
  readonly discipline: Discipline;
  readonly startedAt: Date;
  readonly metrics: WorkoutMetrics;
  /** A logged workout counts until it stops counting; only counting workouts make progress. */
  readonly counts: boolean;
  readonly sourceRevision: SourceRevision;
  readonly loggedAt: Date;
}

/**
 * Training Progress' own model of a workout from Workout Tracking. Created and changed only
 * through the anticorruption layer. A change whose source revision isn't newer than the stored
 * one is ignored: that protects against reordering, on top of the inbox against redelivery.
 */
export class LoggedWorkout extends AggregateRoot<LoggedWorkoutEvent> {
  private wrappedProps: LoggedWorkoutProps;

  private constructor(props: LoggedWorkoutProps, version: number) {
    super(version);
    this.wrappedProps = props;
  }

  /** Adds a workout to the member's training log. */
  static log(params: Omit<LoggedWorkoutProps, 'counts' | 'loggedAt'> & { now: Date }): LoggedWorkout {
    const { now, ...props } = params;
    const loggedWorkout = new LoggedWorkout({ ...props, counts: true, loggedAt: now }, 0);
    loggedWorkout.record(new WorkoutLogged(props.id, props.memberId, props.discipline, props.startedAt, props.metrics, now));
    return loggedWorkout;
  }

  /**
   * Logs a workout whose void overtook its recording: kept, so an older recording that arrives
   * later is ignored, but it never counted. Nothing in the member's training log changes, so no
   * event is raised.
   */
  static logStoppedCounting(params: Omit<LoggedWorkoutProps, 'counts' | 'loggedAt'> & { now: Date }): LoggedWorkout {
    const { now, ...props } = params;
    return new LoggedWorkout({ ...props, counts: false, loggedAt: now }, 0);
  }

  /** Rebuilds a logged workout from storage. Its source revision is its optimistic-lock version. */
  static reconstitute(props: LoggedWorkoutProps): LoggedWorkout {
    return new LoggedWorkout(props, props.sourceRevision.value);
  }

  get id(): LoggedWorkoutId {
    return this.wrappedProps.id;
  }

  get props(): LoggedWorkoutProps {
    return this.wrappedProps;
  }

  /** Replaces the metrics (a correction upstream). Ignored unless the source revision is newer. */
  revise(metrics: WorkoutMetrics, sourceRevision: SourceRevision, now: Date): void {
    if (!sourceRevision.isNewerThan(this.wrappedProps.sourceRevision)) {
      return;
    }
    const previousMetrics = this.wrappedProps.metrics;
    this.wrappedProps = { ...this.wrappedProps, metrics, sourceRevision };
    if (!this.wrappedProps.counts || previousMetrics.equals(metrics)) {
      return;
    }
    const { id, memberId, discipline, startedAt } = this.wrappedProps;
    this.record(new LoggedWorkoutRevised(id, memberId, discipline, startedAt, previousMetrics, metrics, now));
  }

  /** Keeps the logged workout but excludes it from everything (a void upstream). Ignored unless the source revision is newer. */
  stopCounting(sourceRevision: SourceRevision, now: Date): void {
    if (!sourceRevision.isNewerThan(this.wrappedProps.sourceRevision)) {
      return;
    }
    const wasCounting = this.wrappedProps.counts;
    this.wrappedProps = { ...this.wrappedProps, counts: false, sourceRevision };
    if (wasCounting) {
      const { id, memberId, discipline, startedAt } = this.wrappedProps;
      this.record(new LoggedWorkoutStoppedCounting(id, memberId, discipline, startedAt, now));
    }
  }

  /** Whether the stored state is behind: a newer source revision was applied, with or without an event. */
  isChangedSinceLoaded(): boolean {
    return this.version !== this.wrappedProps.sourceRevision.value;
  }
}
