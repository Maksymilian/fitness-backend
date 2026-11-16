import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { WorkoutRepository } from '../../domain/workout.repository.js';
import { representWorkout } from '../workout.representation.interface.js';
import { VoidWorkoutCommand } from './void-workout.command.js';

/** Voids a workout: loads it, calls `void`, saves it and stages its events in one transaction. */
@CommandHandler(VoidWorkoutCommand)
export class VoidWorkoutHandler implements ICommandHandler<VoidWorkoutCommand> {
  constructor(
    private readonly workoutRepository: WorkoutRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ workoutId, reason }: VoidWorkoutCommand) {
    const workout = await this.workoutRepository.get(workoutId);
    workout.void(reason, new Date());
    await this.transactions.run(async (tx) => {
      await this.workoutRepository.save(tx, workout);
      await this.events.publish(tx, workout.pullDomainEvents());
    });
    return representWorkout(workout);
  }
}
