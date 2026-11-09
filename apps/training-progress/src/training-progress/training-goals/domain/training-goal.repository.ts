import type { Transaction } from '@app/ddd';
import type { MemberId } from '../../members/domain/values/member-id.js';
import type { TrainingGoal } from './training-goal.js';
import type { TrainingGoalId } from './values/training-goal-id.js';

/** Port: loads and saves whole `TrainingGoal` aggregates. */
export abstract class TrainingGoalRepository {
  /** @throws TrainingGoalNotFound */
  abstract get(id: TrainingGoalId): Promise<TrainingGoal>;

  /** The member's active goals. */
  abstract activeGoalsOf(memberId: MemberId): Promise<TrainingGoal[]>;

  /** Active goals whose grace period ended at or before `now`. */
  abstract activeGoalsPastGracePeriod(now: Date): Promise<TrainingGoal[]>;

  /** @throws ConcurrencyConflict when the goal changed since it was loaded */
  abstract save(tx: Transaction, goal: TrainingGoal): Promise<void>;
}
