import { DomainError } from '@app/ddd';

/** Thrown when a payment is negative or a refund isn't more than zero. */
export class InvalidLedgerEntryAmount extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(kind: string, amount: string) {
    super(`A ${kind.toLowerCase()} of ${amount} is not possible: a payment is zero or more, a refund more than zero`);
  }
}
