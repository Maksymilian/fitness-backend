import { AggregateRoot } from '@app/ddd';
import type { MemberId } from '../../members/domain/values/member-id.js';
import type { SourceRevision } from '../../training-log/domain/values/source-revision.js';
import { GoalAllowanceReached } from './errors/goal-allowance-reached.js';
import { GoalAllowanceExtended } from './events/goal-allowance-extended.js';
import { GoalAllowanceRestricted } from './events/goal-allowance-restricted.js';

/** The domain events a goal allowance records. */
export type GoalAllowanceEvent = GoalAllowanceExtended | GoalAllowanceRestricted;

/** Without a membership, a member holds one active training goal at a time. */
const ACTIVE_GOALS_WITHOUT_MEMBERSHIP = 1;

/** What a goal allowance holds, as the repository saves and reconstitutes it. */
export interface GoalAllowanceProps {
  readonly memberId: MemberId;
  /** Any number of active goals, while the member has a membership in Billing. */
  readonly unlimited: boolean;
  /** The membership's revision in Billing at the last change; null until Billing told us anything. */
  readonly sourceRevision: SourceRevision | null;
}

/**
 * How many active training goals a member may hold at once: one, or any number while they have a
 * membership. Changed only through the anticorruption layer towards Billing, which translates a
 * membership that started into Extend, one that ended into Restrict. A change with a source revision
 * that isn't newer than the stored one is ignored: Billing's events can arrive out of order.
 */
export class GoalAllowance extends AggregateRoot<GoalAllowanceEvent> {
  private wrappedProps: GoalAllowanceProps;

  private constructor(props: GoalAllowanceProps, version: number) {
    super(version);
    this.wrappedProps = props;
  }

  /** A member Billing never told us about: one active goal. Saved only once it changes. */
  static of(memberId: MemberId): GoalAllowance {
    return new GoalAllowance({ memberId, unlimited: false, sourceRevision: null }, 0);
  }

  static reconstitute(props: GoalAllowanceProps, version: number): GoalAllowance {
    return new GoalAllowance(props, version);
  }

  get props(): GoalAllowanceProps {
    return this.wrappedProps;
  }

  /** @throws GoalAllowanceReached when one more active goal is more than the member may hold. */
  ensurePermits(activeGoals: number): void {
    if (!this.wrappedProps.unlimited && activeGoals >= ACTIVE_GOALS_WITHOUT_MEMBERSHIP) {
      throw new GoalAllowanceReached(this.wrappedProps.memberId.value);
    }
  }

  /** The member's membership started: any number of active goals. */
  extend(sourceRevision: SourceRevision, now: Date): void {
    this.apply(sourceRevision, true, () => new GoalAllowanceExtended(this.wrappedProps.memberId, now));
  }

  /** The member's membership ended: one active goal again. The goals already set are kept. */
  restrict(sourceRevision: SourceRevision, now: Date): void {
    this.apply(sourceRevision, false, () => new GoalAllowanceRestricted(this.wrappedProps.memberId, now));
  }

  private apply(sourceRevision: SourceRevision, unlimited: boolean, event: () => GoalAllowanceEvent): void {
    const { sourceRevision: current } = this.wrappedProps;
    if (current && !sourceRevision.isNewerThan(current)) {
      return;
    }
    const changed = this.wrappedProps.unlimited !== unlimited;
    this.wrappedProps = { ...this.wrappedProps, unlimited, sourceRevision };
    if (changed) {
      this.record(event());
    }
  }
}
