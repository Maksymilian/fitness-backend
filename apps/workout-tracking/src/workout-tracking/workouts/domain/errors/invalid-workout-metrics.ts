import { DomainError } from '@app/ddd';

/** Thrown when a workout's metrics aren't valid; the message says why. */
export class InvalidWorkoutMetrics extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(reason: string) {
    super(`Invalid workout metrics: ${reason}`);
  }
}
