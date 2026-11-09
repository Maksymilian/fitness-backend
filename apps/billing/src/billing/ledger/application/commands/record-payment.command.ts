import { Command } from '@nestjs/cqrs';
import type { MemberId } from '../../../memberships/domain/values/member-id.js';
import type { ProviderReference } from '../../../memberships/domain/values/provider-reference.js';
import type { PaidFor } from '../../domain/ledger-entry.js';
import type { Money } from '../../domain/values/money.js';

/** The payment provider reports a payment for a membership. `messageId` is its event id: recorded once. */
export class RecordPaymentCommand extends Command<{ duplicate: boolean }> {
  constructor(
    readonly memberId: MemberId,
    readonly amount: Money,
    readonly occurredAt: Date,
    readonly providerReference: ProviderReference,
    readonly paidFor: PaidFor,
    readonly messageId: string,
  ) {
    super();
  }
}
