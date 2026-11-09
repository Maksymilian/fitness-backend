import { AggregateRoot } from '@app/ddd';
import type { MemberId } from '../../memberships/domain/values/member-id.js';
import type { MembershipPlan } from '../../memberships/domain/values/membership-plan.js';
import type { ProviderReference } from '../../memberships/domain/values/provider-reference.js';
import { InvalidLedgerEntryAmount } from './errors/invalid-ledger-entry-amount.js';
import { PaymentRecorded } from './events/payment-recorded.js';
import { RefundRecorded } from './events/refund-recorded.js';
import { LedgerEntryId } from './values/ledger-entry-id.js';
import { LedgerEntryKind } from './values/ledger-entry-kind.js';
import type { Money } from './values/money.js';

export type LedgerEntryEvent = PaymentRecorded | RefundRecorded;

/** What a payment paid for: a membership plan, through a date, for the provider's membership (Stripe's subscription). */
export interface PaidFor {
  readonly plan: MembershipPlan;
  readonly paidThrough: Date;
  readonly membershipReference: ProviderReference;
}

export interface LedgerEntryProps {
  readonly id: LedgerEntryId;
  readonly memberId: MemberId;
  readonly kind: LedgerEntryKind;
  readonly amount: Money;
  /** When the money moved, as the payment provider reports it. */
  readonly occurredAt: Date;
  /** The payment provider's id of the movement: Stripe's invoice for a payment, refund for a refund. */
  readonly providerReference: ProviderReference;
  /** Payments only. */
  readonly paidFor: PaidFor | null;
  readonly recordedAt: Date;
}

/**
 * One movement of money between a member and the platform: a payment or a refund. Recorded once
 * and never changed (a refund is an entry of its own), so it has no version: nothing can change it
 * concurrently. The provider reference is unique per kind, which makes recording it twice fail.
 */
export class LedgerEntry extends AggregateRoot<LedgerEntryEvent> {
  readonly #props: LedgerEntryProps;

  private constructor(props: LedgerEntryProps, version: number) {
    super(version);
    this.#props = props;
  }

  /** A member paid for their membership: zero or more (a fully discounted period is a payment of 0.00). */
  static recordPayment(params: {
    memberId: MemberId;
    amount: Money;
    occurredAt: Date;
    providerReference: ProviderReference;
    paidFor: PaidFor;
    now: Date;
  }): LedgerEntry {
    const { now, paidFor, ...facts } = params;
    if (facts.amount.isNegative()) {
      throw new InvalidLedgerEntryAmount(LedgerEntryKind.Payment.value, facts.amount.toString());
    }
    const entry = new LedgerEntry({ ...facts, id: LedgerEntryId.generate(), kind: LedgerEntryKind.Payment, paidFor, recordedAt: now }, 0);
    const { plan, paidThrough, membershipReference } = paidFor;
    entry.record(new PaymentRecorded(entry.id, facts.memberId, facts.amount, plan, paidThrough, membershipReference, facts.occurredAt));
    return entry;
  }

  /** Money was given back to a member: more than zero. */
  static recordRefund(params: { memberId: MemberId; amount: Money; occurredAt: Date; providerReference: ProviderReference; now: Date }): LedgerEntry {
    const { now, ...facts } = params;
    if (facts.amount.isNegative() || facts.amount.isZero()) {
      throw new InvalidLedgerEntryAmount(LedgerEntryKind.Refund.value, facts.amount.toString());
    }
    const entry = new LedgerEntry({ ...facts, id: LedgerEntryId.generate(), kind: LedgerEntryKind.Refund, paidFor: null, recordedAt: now }, 0);
    entry.record(new RefundRecorded(entry.id, facts.memberId, facts.amount, facts.occurredAt));
    return entry;
  }

  static reconstitute(props: LedgerEntryProps): LedgerEntry {
    return new LedgerEntry(props, 1);
  }

  get id(): LedgerEntryId {
    return this.#props.id;
  }

  get props(): LedgerEntryProps {
    return this.#props;
  }
}
