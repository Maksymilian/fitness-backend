import { DomainError } from '@app/ddd';

export class InvalidProviderReference extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a payment provider reference`);
  }
}
