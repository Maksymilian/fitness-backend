import { DomainError } from '@app/ddd';

export class GoalAllowanceReached extends DomainError {
  readonly kind = 'conflict';

  constructor(memberId: string) {
    super(`${memberId} already holds an active training goal: without a membership, one at a time. Abandon it, or start a membership`);
  }
}
