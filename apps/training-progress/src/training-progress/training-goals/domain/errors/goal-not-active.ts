import { DomainError } from '@app/ddd';

/** Thrown when a goal that is achieved, missed or abandoned is asked to change. */
export class GoalNotActive extends DomainError {
  readonly kind = 'conflict';

  constructor(trainingGoalId: string, status: string) {
    super(`Training goal ${trainingGoalId} is ${status.toLowerCase()}, not active`);
  }
}
