import type { Transaction } from '@app/ddd';
import type { MemberId } from '../../members/domain/values/member-id.js';
import type { GoalAllowance } from './goal-allowance.js';

/** Port: loads and saves whole `GoalAllowance` aggregates, one per member. */
export abstract class GoalAllowanceRepository {
  /** The member's allowance: one active goal when Billing never told us about them. */
  abstract get(memberId: MemberId, tx?: Transaction): Promise<GoalAllowance>;

  /** @throws ConcurrencyConflict when the allowance changed since it was loaded */
  abstract save(tx: Transaction, allowance: GoalAllowance): Promise<void>;
}
