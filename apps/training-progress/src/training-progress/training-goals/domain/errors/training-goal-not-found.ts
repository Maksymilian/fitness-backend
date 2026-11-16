import { DomainError } from '@app/ddd';

/** Thrown when no training goal of the member has the given id. */
export class TrainingGoalNotFound extends DomainError {
  readonly kind = 'not-found';

  constructor(trainingGoalId: string) {
    super(`Training goal ${trainingGoalId} not found`);
  }
}
