import { DomainError } from '@app/ddd';

export class MembershipNotFound extends DomainError {
  readonly kind = 'not-found';

  constructor(memberId: string) {
    super(`${memberId} has no membership`);
  }
}
