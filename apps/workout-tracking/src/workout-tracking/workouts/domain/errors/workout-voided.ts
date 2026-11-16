import { DomainError } from '@app/ddd';

/** Thrown when a voided workout is asked to change. */
export class WorkoutVoided extends DomainError {
  readonly kind = 'conflict';

  constructor(workoutId: string) {
    super(`Workout ${workoutId} is voided: it can't be corrected or voided again`);
  }
}
