import { DomainError } from '@app/ddd';

/** Thrown when a recording says the workout started after now. */
export class WorkoutStartedInTheFuture extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(startedAt: Date) {
    super(`A workout can't start in the future (${startedAt.toISOString()})`);
  }
}
