import type { MemberId } from '../values/member-id.js';
import type { MembershipId } from '../values/membership-id.js';
import type { MembershipPlan } from '../values/membership-plan.js';
import type { MembershipStatus } from '../values/membership-status.js';

/** The facts of a membership right after a change, as every membership event carries them. */
export interface MembershipFacts {
  readonly membershipId: MembershipId;
  readonly memberId: MemberId;
  readonly plan: MembershipPlan;
  readonly status: MembershipStatus;
  readonly paidThrough: Date;
  readonly renews: boolean;
  /** 1 when the membership first started, plus 1 for every change: the order of its events. */
  readonly revision: number;
}
