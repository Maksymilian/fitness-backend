import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { GoalAllowanceRepository } from '../../domain/goal-allowance.repository.js';
import { ChangeGoalAllowanceCommand } from './change-goal-allowance.command.js';

/** The inbox of the anticorruption layer towards Billing. */
export const BILLING_ACL_CONSUMER = 'training-progress.billing';

@CommandHandler(ChangeGoalAllowanceCommand)
export class ChangeGoalAllowanceHandler implements ICommandHandler<ChangeGoalAllowanceCommand> {
  constructor(
    private readonly allowances: GoalAllowanceRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ memberId, change, sourceRevision, messageId }: ChangeGoalAllowanceCommand) {
    await this.transactions.runOnce(BILLING_ACL_CONSUMER, messageId, async (tx) => {
      const allowance = await this.allowances.get(memberId, tx);
      const version = allowance.props.sourceRevision;
      if (change === 'extend') allowance.extend(sourceRevision, new Date());
      else allowance.restrict(sourceRevision, new Date());
      // Saved when its source revision moved, even without an event: a later, older event must find it.
      if (allowance.props.sourceRevision !== version) {
        await this.allowances.save(tx, allowance);
        await this.events.publish(tx, allowance.pullDomainEvents());
      }
    });
  }
}
