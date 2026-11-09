import { DomainEvent } from '@app/ddd';
import type { MemberId } from '../../../memberships/domain/values/member-id.js';
import type { MembershipPlan } from '../../../memberships/domain/values/membership-plan.js';
import type { ProviderReference } from '../../../memberships/domain/values/provider-reference.js';
import type { LedgerEntryId } from '../values/ledger-entry-id.js';
import type { Money } from '../values/money.js';

/** A member paid for their membership: a payment is in the ledger. Carries what it paid for. */
export class PaymentRecorded extends DomainEvent {
  constructor(
    readonly ledgerEntryId: LedgerEntryId,
    readonly memberId: MemberId,
    readonly amount: Money,
    readonly plan: MembershipPlan,
    readonly paidThrough: Date,
    /** The payment provider's id of the membership paid for: Stripe's subscription. */
    readonly membershipReference: ProviderReference,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
