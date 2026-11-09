import { UnknownMembershipPlan } from '../errors/unknown-membership-plan.js';

export type MembershipPlanName = 'MONTHLY' | 'YEARLY';

/** How often a membership is paid: `Monthly` or `Yearly`. The prices are the payment provider's catalog. */
export class MembershipPlan {
  static readonly Monthly = new MembershipPlan('MONTHLY');
  static readonly Yearly = new MembershipPlan('YEARLY');

  private constructor(readonly value: MembershipPlanName) {}

  static from(value: string): MembershipPlan {
    if (value === 'MONTHLY') return MembershipPlan.Monthly;
    if (value === 'YEARLY') return MembershipPlan.Yearly;
    throw new UnknownMembershipPlan(value);
  }

  equals(other: MembershipPlan): boolean {
    return this.value === other.value;
  }
}
