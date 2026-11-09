import type { MembershipSnapshotV1 } from '@app/billing-contracts';
import type { MembershipFacts } from '../memberships/domain/events/membership-facts.interface.js';

/** Translates a membership event's facts into the published language: the whole membership. */
export function toMembershipSnapshotV1(membership: MembershipFacts): MembershipSnapshotV1 {
  return {
    membershipId: membership.membershipId.value,
    memberId: membership.memberId.value,
    plan: membership.plan.value,
    status: membership.status.value,
    paidThrough: membership.paidThrough.toISOString(),
    renews: membership.renews,
    revision: membership.revision,
  };
}
