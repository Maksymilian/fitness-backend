import { DomainError } from '@app/ddd';

/** Thrown when an amount of money isn't valid; the message says why. */
export class InvalidMoney extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(reason: string) {
    super(`Invalid amount: ${reason}`);
  }
}
