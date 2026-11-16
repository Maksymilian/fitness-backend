import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { WorkoutRepository } from '../../domain/workout.repository.js';
import { representWorkout } from '../workout.representation.interface.js';
import { CorrectWorkoutCommand } from './correct-workout.command.js';

/** Corrects a workout: loads it, calls `correct`, saves it and stages its events in one transaction. */
@CommandHandler(CorrectWorkoutCommand)
export class CorrectWorkoutHandler implements ICommandHandler<CorrectWorkoutCommand> {
  constructor(
    private readonly workoutRepository: WorkoutRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ workoutId, metrics, reason }: CorrectWorkoutCommand) {
    const workout = await this.workoutRepository.get(workoutId);
    workout.correct(metrics, reason, new Date());
    await this.transactions.run(async (tx) => {
      await this.workoutRepository.save(tx, workout);
      await this.events.publish(tx, workout.pullDomainEvents());
    });
    return representWorkout(workout);
  }
}
