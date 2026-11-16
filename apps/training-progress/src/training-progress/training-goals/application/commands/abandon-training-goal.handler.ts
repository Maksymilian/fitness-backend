import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { TrainingGoalRepository } from '../../domain/training-goal.repository.js';
import { representTrainingGoal } from '../training-goal.representation.interface.js';
import { AbandonTrainingGoalCommand } from './abandon-training-goal.command.js';

/** Abandons a training goal: loads it, calls `abandon`, saves it and stages its events in one transaction. */
@CommandHandler(AbandonTrainingGoalCommand)
export class AbandonTrainingGoalHandler implements ICommandHandler<AbandonTrainingGoalCommand> {
  constructor(
    private readonly goals: TrainingGoalRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ memberId, trainingGoalId }: AbandonTrainingGoalCommand) {
    const goal = await this.goals.get(trainingGoalId);
    goal.abandon(memberId, new Date());
    await this.transactions.run(async (tx) => {
      await this.goals.save(tx, goal);
      await this.events.publish(tx, goal.pullDomainEvents());
    });
    return representTrainingGoal(goal);
  }
}
