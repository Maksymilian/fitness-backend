import { AggregateRoot } from '@app/ddd';
import { PaymentForAnotherMembership } from './errors/payment-for-another-membership.js';
import { MembershipCancelled } from './events/membership-cancelled.js';
import { MembershipEnded } from './events/membership-ended.js';
import type { MembershipFacts } from './events/membership-facts.interface.js';
import { MembershipPlanSwitched } from './events/membership-plan-switched.js';
import { MembershipRenewed } from './events/membership-renewed.js';
import { MembershipResumed } from './events/membership-resumed.js';
import { MembershipStarted } from './events/membership-started.js';
import type { MemberId } from './values/member-id.js';
import { MembershipId } from './values/membership-id.js';
import type { MembershipPlan } from './values/membership-plan.js';
import { MembershipStatus } from './values/membership-status.js';
import type { ProviderReference } from './values/provider-reference.js';

export type MembershipEvent =
  | MembershipStarted
  | MembershipRenewed
  | MembershipPlanSwitched
  | MembershipCancelled
  | MembershipResumed
  | MembershipEnded;

/** A payment the membership is paid with: for a plan, through a date, under the provider's reference. */
export interface MembershipPayment {
  readonly plan: MembershipPlan;
  readonly paidThrough: Date;
  /** The payment provider's id of the membership it pays for: Stripe's subscription. */
  readonly providerReference: ProviderReference;
}

export interface MembershipProps {
  readonly id: MembershipId;
  readonly memberId: MemberId;
  readonly plan: MembershipPlan;
  readonly status: MembershipStatus;
  readonly paidThrough: Date;
  readonly renews: boolean;
  readonly providerReference: ProviderReference;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  /** 1 when it first started, plus 1 for every change. Also its version for optimistic locking. */
  readonly revision: number;
}

/**
 * A member's paid access to the platform, on a membership plan, paid through a date. One per member,
 * so a member never has two at once: it starts with a payment, renews, can be cancelled and resumed,
 * ends, and starts again. Every method that doesn't apply changes nothing and raises nothing, so the
 * payment provider's events can be applied twice, or late.
 */
export class Membership extends AggregateRoot<MembershipEvent> {
  #props: MembershipProps;

  private constructor(props: MembershipProps) {
    super(props.revision);
    this.#props = props;
  }

  /** A member's first payment starts their membership, with renewal on. */
  static start(params: { memberId: MemberId; payment: MembershipPayment; now: Date }): Membership {
    const { memberId, payment, now } = params;
    const membership = new Membership({
      id: MembershipId.generate(),
      memberId,
      plan: payment.plan,
      status: MembershipStatus.Active,
      paidThrough: payment.paidThrough,
      renews: true,
      providerReference: payment.providerReference,
      startedAt: now,
      endedAt: null,
      revision: 0,
    });
    membership.change({ revision: 1 });
    membership.record(new MembershipStarted(membership.facts(), now));
    return membership;
  }

  static reconstitute(props: MembershipProps): Membership {
    return new Membership(props);
  }

  get id(): MembershipId {
    return this.#props.id;
  }

  get memberId(): MemberId {
    return this.#props.memberId;
  }

  get props(): MembershipProps {
    return this.#props;
  }

  get isActive(): boolean {
    return this.#props.status.equals(MembershipStatus.Active);
  }

  /**
   * A payment for the membership. An ended membership starts again with it (a new period, renewal
   * on). An active one is paid through the later date; one paid through it already changes nothing.
   * @throws PaymentForAnotherMembership when it's active and the payment is for another of the
   *   provider's memberships: the member paid twice, and one payment has to be refunded.
   */
  renew(payment: MembershipPayment, now: Date): void {
    if (!this.isActive) {
      this.change({
        plan: payment.plan,
        status: MembershipStatus.Active,
        paidThrough: payment.paidThrough,
        renews: true,
        providerReference: payment.providerReference,
        startedAt: now,
        endedAt: null,
      });
      this.record(new MembershipStarted(this.facts(), now));
      return;
    }
    if (!this.#props.providerReference.equals(payment.providerReference)) {
      throw new PaymentForAnotherMembership(this.#props.memberId.value, payment.providerReference.value);
    }
    if (payment.paidThrough <= this.#props.paidThrough) {
      return;
    }
    this.change({ paidThrough: payment.paidThrough });
    this.record(new MembershipRenewed(this.facts(), now));
  }

  /** The member moves to the other plan. Ignored for another membership, an ended one, or the same plan. */
  switchPlan(plan: MembershipPlan, providerReference: ProviderReference, now: Date): void {
    if (!this.concerns(providerReference) || this.#props.plan.equals(plan)) {
      return;
    }
    this.change({ plan });
    this.record(new MembershipPlanSwitched(this.facts(), now));
  }

  /** The member turns renewal off: still active until it's paid through. */
  cancel(providerReference: ProviderReference, now: Date): void {
    if (!this.concerns(providerReference) || !this.#props.renews) {
      return;
    }
    this.change({ renews: false });
    this.record(new MembershipCancelled(this.facts(), now));
  }

  /** The member turns renewal on again, before the membership ended. */
  resume(providerReference: ProviderReference, now: Date): void {
    if (!this.concerns(providerReference) || this.#props.renews) {
      return;
    }
    this.change({ renews: true });
    this.record(new MembershipResumed(this.facts(), now));
  }

  /** The membership stops giving access: the provider ended it (renewal off and paid through, or a renewal it gave up on). */
  end(providerReference: ProviderReference, now: Date): void {
    if (!this.concerns(providerReference)) {
      return;
    }
    this.change({ status: MembershipStatus.Ended, renews: false, endedAt: now });
    this.record(new MembershipEnded(this.facts(), now));
  }

  /** Whether a change from the provider is about this membership while it's active: not an older one, not after it ended. */
  private concerns(providerReference: ProviderReference): boolean {
    return this.isActive && this.#props.providerReference.equals(providerReference);
  }

  private change(changes: Partial<MembershipProps>): void {
    this.#props = { ...this.#props, ...changes, revision: (changes.revision ?? this.#props.revision + 1) };
  }

  private facts(): MembershipFacts {
    const { id, memberId, plan, status, paidThrough, renews, revision } = this.#props;
    return { membershipId: id, memberId, plan, status, paidThrough, renews, revision };
  }
}
