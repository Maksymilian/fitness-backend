import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { GoalAllowanceRepository } from '../../domain/goal-allowance.repository.js';
import { TrainingGoal } from '../../domain/training-goal.js';
import { TrainingGoalRepository } from '../../domain/training-goal.repository.js';
import { GoalPeriod } from '../../domain/values/goal-period.js';
import { representTrainingGoal } from '../training-goal.representation.interface.js';
import { SetTrainingGoalCommand } from './set-training-goal.command.js';

/**
 * Sets a goal, if the member's goal allowance permits one more active goal: one without a
 * membership, any number with one. The allowance decides; this counts the active goals. Two goals
 * set at the same moment can both pass the count (ADR 2): the member gains one goal, nothing more.
 */
@CommandHandler(SetTrainingGoalCommand)
export class SetTrainingGoalHandler implements ICommandHandler<SetTrainingGoalCommand> {
  constructor(
    private readonly goals: TrainingGoalRepository,
    private readonly allowances: GoalAllowanceRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ memberId, metric, target, discipline, startsOn, endsOn }: SetTrainingGoalCommand) {
    const allowance = await this.allowances.get(memberId);
    allowance.ensurePermits((await this.goals.activeGoalsOf(memberId)).length);
    const now = new Date();
    const goal = TrainingGoal.set({ memberId, metric, target, discipline, period: GoalPeriod.of(startsOn, endsOn, now), now });
    await this.transactions.run(async (tx) => {
      await this.goals.save(tx, goal);
      await this.events.publish(tx, goal.pullDomainEvents());
    });
    return representTrainingGoal(goal);
  }
}
