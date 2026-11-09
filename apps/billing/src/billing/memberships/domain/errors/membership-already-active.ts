import { DomainError } from '@app/ddd';

export class MembershipAlreadyActive extends DomainError {
  readonly kind = 'conflict';

  constructor(memberId: string) {
    super(`${memberId} already has an active membership: change it in the billing portal`);
  }
}
