import { Command } from '@nestjs/cqrs';
import type { MemberId } from '../../../memberships/domain/values/member-id.js';
import type { ProviderReference } from '../../../memberships/domain/values/provider-reference.js';
import type { Money } from '../../domain/values/money.js';

/** The payment provider reports a refund. `messageId` is its event id: recorded once. */
export class RecordRefundCommand extends Command<{ duplicate: boolean }> {
  constructor(
    readonly memberId: MemberId,
    readonly amount: Money,
    readonly occurredAt: Date,
    readonly providerReference: ProviderReference,
    readonly messageId: string,
  ) {
    super();
  }
}
