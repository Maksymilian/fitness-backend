import { DomainError } from '@app/ddd';

export class InvalidMemberId extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a member id`);
  }
}
