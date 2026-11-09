import { DomainError } from '@app/ddd';

export class UnknownCurrency extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(code: string) {
    super(`"${code}" is not a currency the platform takes: EUR, PLN, USD or GBP`);
  }
}
