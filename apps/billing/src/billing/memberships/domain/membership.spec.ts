import { PaymentForAnotherMembership } from './errors/payment-for-another-membership.js';
import { MembershipCancelled } from './events/membership-cancelled.js';
import { MembershipEnded } from './events/membership-ended.js';
import { MembershipPlanSwitched } from './events/membership-plan-switched.js';
import { MembershipRenewed } from './events/membership-renewed.js';
import { MembershipResumed } from './events/membership-resumed.js';
import { MembershipStarted } from './events/membership-started.js';
import { Membership, type MembershipPayment } from './membership.js';
import { MemberId } from './values/member-id.js';
import { MembershipPlan } from './values/membership-plan.js';
import { MembershipStatus } from './values/membership-status.js';
import { ProviderReference } from './values/provider-reference.js';

const ada = MemberId.from('ada@example.com');
const subscription = ProviderReference.from('sub_1');
const now = new Date('2026-10-30T10:00:00Z');
const payment = (paidThrough: string, reference = subscription, plan = MembershipPlan.Monthly): MembershipPayment => ({
  plan,
  paidThrough: new Date(paidThrough),
  providerReference: reference,
});

/** Given a started membership whose events were already handed over. */
function started(): Membership {
  const membership = Membership.start({ memberId: ada, payment: payment('2026-11-30T10:00:00Z'), now });
  membership.pullDomainEvents();
  return membership;
}

describe('Membership', () => {
  describe('start', () => {
    it('starts with its first payment: active, renewing, paid through the first period, revision 1', () => {
      const membership = Membership.start({ memberId: ada, payment: payment('2026-11-30T10:00:00Z'), now });

      const [event] = membership.pullDomainEvents();
      expect(event).toBeInstanceOf(MembershipStarted);
      expect((event as MembershipStarted).membership).toMatchObject({ status: MembershipStatus.Active, renews: true, revision: 1 });
      expect(membership.version).toBe(0);
      expect(membership.props.paidThrough).toEqual(new Date('2026-11-30T10:00:00Z'));
    });
  });

  describe('renew', () => {
    it('moves paid through forward with the next payment', () => {
      const membership = started();

      membership.renew(payment('2026-12-30T10:00:00Z'), now);

      expect(membership.pullDomainEvents()).toEqual([expect.any(MembershipRenewed)]);
      expect(membership.props).toMatchObject({ paidThrough: new Date('2026-12-30T10:00:00Z'), revision: 2 });
    });

    it('changes nothing for a payment it is paid through already: applied twice, or late', () => {
      const membership = started();

      membership.renew(payment('2026-11-30T10:00:00Z'), now);
      membership.renew(payment('2026-11-01T10:00:00Z'), now);

      expect(membership.pullDomainEvents()).toEqual([]);
      expect(membership.props.revision).toBe(1);
    });

    it('refuses a payment for another membership while this one is active: one of them is refunded', () => {
      const membership = started();

      expect(() => membership.renew(payment('2026-12-30T10:00:00Z', ProviderReference.from('sub_2')), now)).toThrow(PaymentForAnotherMembership);
      expect(membership.hasChanges()).toBe(false);
    });

    it('starts an ended membership again, on the new plan and the new provider reference', () => {
      const membership = started();
      membership.end(subscription, now);
      membership.pullDomainEvents();

      membership.renew(payment('2027-10-30T10:00:00Z', ProviderReference.from('sub_2'), MembershipPlan.Yearly), now);

      const [event] = membership.pullDomainEvents();
      expect(event).toBeInstanceOf(MembershipStarted);
      expect(membership.props).toMatchObject({ status: MembershipStatus.Active, plan: MembershipPlan.Yearly, renews: true, endedAt: null, revision: 3 });
    });
  });

  describe('cancel and resume', () => {
    it('turns renewal off, and on again; each once', () => {
      const membership = started();

      membership.cancel(subscription, now);
      membership.cancel(subscription, now);
      membership.resume(subscription, now);
      membership.resume(subscription, now);

      expect(membership.pullDomainEvents()).toEqual([expect.any(MembershipCancelled), expect.any(MembershipResumed)]);
      expect(membership.props).toMatchObject({ status: MembershipStatus.Active, renews: true });
    });

    it('stays active, paid through, after a cancellation', () => {
      const membership = started();

      membership.cancel(subscription, now);

      expect(membership.isActive).toBe(true);
      expect(membership.props.renews).toBe(false);
    });
  });

  describe('switch plan', () => {
    it('moves to the other plan, and changes nothing for the same plan', () => {
      const membership = started();

      membership.switchPlan(MembershipPlan.Monthly, subscription, now);
      membership.switchPlan(MembershipPlan.Yearly, subscription, now);

      expect(membership.pullDomainEvents()).toEqual([expect.any(MembershipPlanSwitched)]);
      expect(membership.props.plan).toBe(MembershipPlan.Yearly);
    });
  });

  describe('end', () => {
    it('stops giving access, once', () => {
      const membership = started();

      membership.end(subscription, now);
      membership.end(subscription, now);

      expect(membership.pullDomainEvents()).toEqual([expect.any(MembershipEnded)]);
      expect(membership.props).toMatchObject({ status: MembershipStatus.Ended, renews: false, endedAt: now });
    });

    it("ignores the provider's changes to an older membership of the member", () => {
      const membership = started();
      const older = ProviderReference.from('sub_0');

      membership.end(older, now);
      membership.cancel(older, now);
      membership.switchPlan(MembershipPlan.Yearly, older, now);

      expect(membership.pullDomainEvents()).toEqual([]);
      expect(membership.isActive).toBe(true);
    });
  });
});
