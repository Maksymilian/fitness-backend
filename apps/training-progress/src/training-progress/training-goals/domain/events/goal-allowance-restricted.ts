import { DomainEvent } from '@app/ddd';
import type { MemberId } from '../../../members/domain/values/member-id.js';

/** The membership ended: the member may hold one active training goal again; the goals set are kept. */
export class GoalAllowanceRestricted extends DomainEvent {
  constructor(
    readonly memberId: MemberId,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
