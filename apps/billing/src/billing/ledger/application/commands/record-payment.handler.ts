import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { PAYMENT_PROVIDER_CONSUMER } from '../../../memberships/application/payment-provider.js';
import { LedgerEntry } from '../../domain/ledger-entry.js';
import { LedgerEntryRepository } from '../../domain/ledger-entry.repository.js';
import { RecordPaymentCommand } from './record-payment.command.js';

/** Records the payment in the ledger, once; Apply Payment then starts or renews the membership. */
@CommandHandler(RecordPaymentCommand)
export class RecordPaymentHandler implements ICommandHandler<RecordPaymentCommand> {
  constructor(
    private readonly ledgerEntries: LedgerEntryRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ messageId, ...payment }: RecordPaymentCommand) {
    const entry = LedgerEntry.recordPayment({ ...payment, now: new Date() });
    const outcome = await this.transactions.runOnce(PAYMENT_PROVIDER_CONSUMER, messageId, async (tx) => {
      await this.ledgerEntries.add(tx, entry);
      await this.events.publish(tx, entry.pullDomainEvents());
    });
    return { duplicate: outcome.duplicate === true };
  }
}
