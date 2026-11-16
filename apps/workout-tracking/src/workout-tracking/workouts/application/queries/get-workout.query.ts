import { Query } from '@nestjs/cqrs';
import type { WorkoutId } from '../../domain/values/workout-id.js';
import type { WorkoutRepresentation } from '../workout.representation.interface.js';

/** Asks for one workout by its id. */
export class GetWorkoutQuery extends Query<WorkoutRepresentation> {
  constructor(readonly workoutId: WorkoutId) {
    super();
  }
}
