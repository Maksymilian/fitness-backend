import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { PAYMENT_PROVIDER_CONSUMER } from '../../../memberships/application/payment-provider.js';
import { LedgerEntry } from '../../domain/ledger-entry.js';
import { LedgerEntryRepository } from '../../domain/ledger-entry.repository.js';
import { RecordRefundCommand } from './record-refund.command.js';

/** Records the refund in the ledger, once. It changes no membership: the provider ends one if it must. */
@CommandHandler(RecordRefundCommand)
export class RecordRefundHandler implements ICommandHandler<RecordRefundCommand> {
  constructor(
    private readonly ledgerEntries: LedgerEntryRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ messageId, ...refund }: RecordRefundCommand) {
    const entry = LedgerEntry.recordRefund({ ...refund, now: new Date() });
    const outcome = await this.transactions.runOnce(PAYMENT_PROVIDER_CONSUMER, messageId, async (tx) => {
      await this.ledgerEntries.add(tx, entry);
      await this.events.publish(tx, entry.pullDomainEvents());
    });
    return { duplicate: outcome.duplicate === true };
  }
}
