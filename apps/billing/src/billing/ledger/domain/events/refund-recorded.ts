import { DomainEvent } from '@app/ddd';
import type { MemberId } from '../../../memberships/domain/values/member-id.js';
import type { LedgerEntryId } from '../values/ledger-entry-id.js';
import type { Money } from '../values/money.js';

/** Money was given back to a member: a refund is in the ledger. */
export class RefundRecorded extends DomainEvent {
  constructor(
    readonly ledgerEntryId: LedgerEntryId,
    readonly memberId: MemberId,
    readonly amount: Money,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
