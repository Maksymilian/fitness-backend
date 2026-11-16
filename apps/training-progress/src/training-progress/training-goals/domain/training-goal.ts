import { AggregateRoot } from '@app/ddd';
import type { MemberId } from '../../members/domain/values/member-id.js';
import type { Discipline } from '../../training-log/domain/values/discipline.js';
import { GoalNotActive } from './errors/goal-not-active.js';
import { TrainingGoalNotFound } from './errors/training-goal-not-found.js';
import { GoalAbandoned } from './events/goal-abandoned.js';
import { GoalAchieved } from './events/goal-achieved.js';
import { GoalMissed } from './events/goal-missed.js';
import { TrainingGoalSet } from './events/training-goal-set.js';
import type { GoalMetric } from './values/goal-metric.js';
import type { GoalPeriod } from './values/goal-period.js';
import type { GoalProgress } from './values/goal-progress.js';
import { GoalProgressCriteria } from './values/goal-progress-criteria.js';
import { GoalStatus } from './values/goal-status.js';
import type { GoalTarget } from './values/goal-target.js';
import { TrainingGoalId } from './values/training-goal-id.js';

/** The domain events a training goal records. */
export type TrainingGoalEvent = TrainingGoalSet | GoalAchieved | GoalMissed | GoalAbandoned;

/** What a training goal holds, as the repository saves and reconstitutes it. */
export interface TrainingGoalProps {
  readonly id: TrainingGoalId;
  readonly memberId: MemberId;
  readonly metric: GoalMetric;
  readonly target: GoalTarget;
  readonly discipline: Discipline | null;
  readonly period: GoalPeriod;
  readonly status: GoalStatus;
  readonly setAt: Date;
  readonly achievedAt: Date | null;
  readonly missedAt: Date | null;
  readonly abandonedAt: Date | null;
}

/**
 * A target a member commits to for a goal period, optionally for one discipline, such as "Cycle
 * 200 km in October". Only an active goal changes status; an achievement is final.
 */
export class TrainingGoal extends AggregateRoot<TrainingGoalEvent> {
  private wrappedProps: TrainingGoalProps;

  private constructor(props: TrainingGoalProps, version: number) {
    super(version);
    this.wrappedProps = props;
  }

  /** A member sets a goal. The target and the period are checked by their value objects. */
  static set(params: {
    memberId: MemberId;
    metric: GoalMetric;
    target: GoalTarget;
    discipline: Discipline | null;
    period: GoalPeriod;
    now: Date;
  }): TrainingGoal {
    const { now, ...props } = params;
    const goal = new TrainingGoal(
      { ...props, id: TrainingGoalId.generate(), status: GoalStatus.Active, setAt: now, achievedAt: null, missedAt: null, abandonedAt: null },
      0,
    );
    goal.record(new TrainingGoalSet(goal.id, goal.memberId, now));
    return goal;
  }

  static reconstitute(props: TrainingGoalProps, version: number): TrainingGoal {
    return new TrainingGoal(props, version);
  }

  get id(): TrainingGoalId {
    return this.wrappedProps.id;
  }

  get memberId(): MemberId {
    return this.wrappedProps.memberId;
  }

  get props(): TrainingGoalProps {
    return this.wrappedProps;
  }

  /** Which logged workouts count towards this goal. The domain decides what counts; the application sums how much. */
  progressCriteria(): GoalProgressCriteria {
    return new GoalProgressCriteria(this.wrappedProps.metric, this.wrappedProps.period, this.wrappedProps.discipline);
  }

  /**
   * Gives the goal its current goal progress. Achieved when the goal is active and the progress
   * reaches the target; otherwise nothing changes, so recording the same progress twice is harmless.
   */
  recordProgress(progress: GoalProgress, now: Date): void {
    const { status, target, id, memberId, metric, discipline, period } = this.wrappedProps;
    if (!status.equals(GoalStatus.Active) || !progress.reaches(target)) {
      return;
    }
    this.wrappedProps = { ...this.wrappedProps, status: GoalStatus.Achieved, achievedAt: now };
    this.record(new GoalAchieved(id, memberId, metric, target, discipline, period, now));
  }

  /** Misses the goal once the grace period has ended while it's still active. */
  miss(now: Date): void {
    if (!this.wrappedProps.status.equals(GoalStatus.Active) || now < this.wrappedProps.period.graceEnd) {
      return;
    }
    this.wrappedProps = { ...this.wrappedProps, status: GoalStatus.Missed, missedAt: now };
    this.record(new GoalMissed(this.id, this.memberId, now));
  }

  /** The goal's member gives up the active goal. Another member's goal is not found for them. */
  abandon(memberId: MemberId, now: Date): void {
    if (!this.wrappedProps.memberId.equals(memberId)) {
      throw new TrainingGoalNotFound(this.id.value);
    }
    if (!this.wrappedProps.status.equals(GoalStatus.Active)) {
      throw new GoalNotActive(this.id.value, this.wrappedProps.status.value);
    }
    this.wrappedProps = { ...this.wrappedProps, status: GoalStatus.Abandoned, abandonedAt: now };
    this.record(new GoalAbandoned(this.id, this.memberId, now));
  }
}
