import { DomainError } from '@app/ddd';

/** Thrown when an upstream revision number isn't a positive whole number. */
export class InvalidSourceRevision extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: number) {
    super(`${value} is not a source revision: a whole number from 1`);
  }
}
