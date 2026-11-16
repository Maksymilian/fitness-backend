import { DomainError } from '@app/ddd';

/** Thrown when setting a goal would take a member past their goal allowance. */
export class GoalAllowanceReached extends DomainError {
  readonly kind = 'conflict';

  constructor(memberId: string) {
    super(`${memberId} already holds an active training goal: without a membership, one at a time. Abandon it, or start a membership`);
  }
}
