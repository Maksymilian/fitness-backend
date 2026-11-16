import { DomainError } from '@app/ddd';

/** Thrown when a member starts a checkout while their membership is still active. */
export class MembershipAlreadyActive extends DomainError {
  readonly kind = 'conflict';

  constructor(memberId: string) {
    super(`${memberId} already has an active membership: change it in the billing portal`);
  }
}
