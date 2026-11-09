import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { MembershipNotFound } from '../../domain/errors/membership-not-found.js';
import { MembershipRepository } from '../../domain/membership.repository.js';
import { PAYMENT_PROVIDER_CONSUMER } from '../payment-provider.js';
import { MembershipQueries } from '../queries/membership-queries.js';
import { ChangeMembershipCommand } from './change-membership.command.js';

/**
 * Applies a change the member made in the billing portal, once per provider event. A change for a
 * membership that hasn't started yet (its payment is still being applied) is refused, and the
 * provider sends it again. That includes an end whose payment is in the ledger but not applied yet:
 * dropped, the membership would start after it and stay active. An end of one that was never paid
 * for is nothing to end.
 */
@CommandHandler(ChangeMembershipCommand)
export class ChangeMembershipHandler implements ICommandHandler<ChangeMembershipCommand> {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
    private readonly queries: MembershipQueries,
  ) {}

  async execute({ providerReference, change, messageId }: ChangeMembershipCommand) {
    const outcome = await this.transactions.runOnce(PAYMENT_PROVIDER_CONSUMER, messageId, async (tx) => {
      const membership = await this.memberships.findByProviderReference(tx, providerReference.value);
      if (!membership) {
        if (change.kind === 'end' && !(await this.queries.paymentRecordedFor(providerReference.value))) {
          return;
        }
        throw new MembershipNotFound(providerReference.value);
      }
      const now = new Date();
      if (change.kind === 'cancel') membership.cancel(providerReference, now);
      if (change.kind === 'resume') membership.resume(providerReference, now);
      if (change.kind === 'switch-plan') membership.switchPlan(change.plan, providerReference, now);
      if (change.kind === 'end') membership.end(providerReference, now);
      if (membership.hasChanges()) {
        await this.memberships.save(tx, membership);
        await this.events.publish(tx, membership.pullDomainEvents());
      }
    });
    return { duplicate: outcome.duplicate === true };
  }
}
