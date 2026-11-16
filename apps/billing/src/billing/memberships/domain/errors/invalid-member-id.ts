import { DomainError } from '@app/ddd';

/** Thrown when a member id is empty or malformed. */
export class InvalidMemberId extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a member id`);
  }
}
