import { DomainError } from '@app/ddd';

/** Thrown when a payment provider's reference is empty or malformed. */
export class InvalidProviderReference extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a payment provider reference`);
  }
}
