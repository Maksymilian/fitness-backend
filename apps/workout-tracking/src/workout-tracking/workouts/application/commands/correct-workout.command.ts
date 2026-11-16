import { Command } from '@nestjs/cqrs';
import type { CorrectionReason } from '../../domain/values/correction-reason.js';
import type { WorkoutId } from '../../domain/values/workout-id.js';
import type { WorkoutMetrics } from '../../domain/values/workout-metrics.js';
import type { WorkoutRepresentation } from '../workout.representation.interface.js';

/** Asks to correct a recorded workout's metrics, with a reason. */
export class CorrectWorkoutCommand extends Command<WorkoutRepresentation> {
  constructor(
    readonly workoutId: WorkoutId,
    readonly metrics: WorkoutMetrics,
    readonly reason: CorrectionReason,
  ) {
    super();
  }
}
