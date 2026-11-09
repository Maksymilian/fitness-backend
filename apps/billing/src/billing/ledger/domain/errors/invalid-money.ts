import { DomainError } from '@app/ddd';

export class InvalidMoney extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(reason: string) {
    super(`Invalid amount: ${reason}`);
  }
}
