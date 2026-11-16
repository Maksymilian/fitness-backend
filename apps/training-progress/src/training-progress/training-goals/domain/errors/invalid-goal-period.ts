import { DomainError } from '@app/ddd';

/** Thrown when a goal's training period isn't valid; the message says why. */
export class InvalidGoalPeriod extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(reason: string) {
    super(`Invalid goal period: ${reason}`);
  }
}
