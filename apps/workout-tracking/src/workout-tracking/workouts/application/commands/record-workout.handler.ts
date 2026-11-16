import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactions } from '../../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { EquipmentRepository } from '../../../equipment/domain/equipment.repository.js';
import { DuplicateRecording } from '../../domain/errors/duplicate-recording.js';
import { WorkoutRepository } from '../../domain/workout.repository.js';
import { representWorkout } from '../workout.representation.interface.js';
import { RecordWorkoutCommand } from './record-workout.command.js';

/**
 * Records a workout from equipment. Submitting a recording id again never creates a second
 * workout: the existing one comes back, also when two identical recordings race.
 */
@CommandHandler(RecordWorkoutCommand)
export class RecordWorkoutHandler implements ICommandHandler<RecordWorkoutCommand> {
  constructor(
    private readonly equipmentRepository: EquipmentRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute({ equipmentId, recording }: RecordWorkoutCommand) {
    const equipment = await this.equipmentRepository.get(equipmentId);
    const existing = await this.workoutRepository.findByRecording(equipmentId, recording.recordingId);
    if (existing) {
      return { workout: representWorkout(existing), duplicate: true };
    }

    const workout = equipment.recordWorkout(recording, new Date());
    try {
      await this.transactions.run(async (tx) => {
        await this.workoutRepository.save(tx, workout);
        await this.events.publish(tx, workout.pullDomainEvents());
      });
    } catch (error) {
      if (!(error instanceof DuplicateRecording)) {
        throw error;
      }
      // Lost a race with an identical recording: its workout and its event are the ones that count.
      const winner = await this.workoutRepository.findByRecording(equipmentId, recording.recordingId);
      if (winner === undefined) {
        throw error;
      }
      return { workout: representWorkout(winner), duplicate: true };
    }
    return { workout: representWorkout(workout), duplicate: false };
  }
}
