import { UnknownMembershipPlan } from '../errors/unknown-membership-plan.js';
import { MembershipPlan } from './membership-plan.js';

describe('MembershipPlan', () => {
  it('is Monthly or Yearly', () => {
    expect(MembershipPlan.from('MONTHLY')).toBe(MembershipPlan.Monthly);
    expect(MembershipPlan.from('YEARLY').equals(MembershipPlan.Yearly)).toBe(true);
  });

  it('refuses anything else', () => {
    expect(() => MembershipPlan.from('WEEKLY')).toThrow(UnknownMembershipPlan);
  });
});
