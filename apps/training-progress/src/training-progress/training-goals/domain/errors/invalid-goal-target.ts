import { DomainError } from '@app/ddd';

/** Thrown when a goal target isn't a positive whole number. */
export class InvalidGoalTarget extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: number) {
    super(`A goal target must be a whole number greater than zero (got ${value})`);
  }
}
