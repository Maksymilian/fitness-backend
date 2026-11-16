import { DomainError } from '@app/ddd';

/** Thrown when a goal metric isn't one Training Progress knows. */
export class UnknownGoalMetric extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a goal metric: DISTANCE, DURATION, CALORIES or WORKOUT_COUNT`);
  }
}
