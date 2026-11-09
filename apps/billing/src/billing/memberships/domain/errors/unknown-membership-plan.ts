import { DomainError } from '@app/ddd';

export class UnknownMembershipPlan extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a membership plan: MONTHLY or YEARLY`);
  }
}
