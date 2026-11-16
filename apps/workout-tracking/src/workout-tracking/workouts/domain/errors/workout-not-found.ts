import { DomainError } from '@app/ddd';

/** Thrown when no workout has the given id. */
export class WorkoutNotFound extends DomainError {
  readonly kind = 'not-found';

  constructor(workoutId: string) {
    super(`Workout ${workoutId} not found`);
  }
}
