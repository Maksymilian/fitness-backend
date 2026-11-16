import { Command } from '@nestjs/cqrs';
import type { VoidReason } from '../../domain/values/void-reason.js';
import type { WorkoutId } from '../../domain/values/workout-id.js';
import type { WorkoutRepresentation } from '../workout.representation.interface.js';

/** Asks to void a recorded workout, with a reason. */
export class VoidWorkoutCommand extends Command<WorkoutRepresentation> {
  constructor(
    readonly workoutId: WorkoutId,
    readonly reason: VoidReason,
  ) {
    super();
  }
}
