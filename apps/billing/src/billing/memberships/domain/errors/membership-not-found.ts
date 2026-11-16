import { DomainError } from '@app/ddd';

/** Thrown when a member has no membership in Billing. */
export class MembershipNotFound extends DomainError {
  readonly kind = 'not-found';

  constructor(memberId: string) {
    super(`${memberId} has no membership`);
  }
}
