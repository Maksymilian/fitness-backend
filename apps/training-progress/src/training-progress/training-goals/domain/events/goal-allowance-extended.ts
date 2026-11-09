import { DomainEvent } from '@app/ddd';
import type { MemberId } from '../../../members/domain/values/member-id.js';

/** A membership started: the member may hold any number of active training goals. */
export class GoalAllowanceExtended extends DomainEvent {
  constructor(
    readonly memberId: MemberId,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
