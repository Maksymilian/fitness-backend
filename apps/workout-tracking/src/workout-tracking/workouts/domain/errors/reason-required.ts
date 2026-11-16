import { DomainError } from '@app/ddd';

/** Thrown when a correction or a void comes without a reason of 1 to 500 characters. */
export class ReasonRequired extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(what: 'correction' | 'void') {
    super(`A ${what} needs a reason of 1 to 500 characters`);
  }
}
