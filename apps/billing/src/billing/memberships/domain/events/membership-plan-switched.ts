import { DomainEvent } from '@app/ddd';
import type { MembershipFacts } from './membership-facts.interface.js';

/** The member moved to the other membership plan. Carries the membership after the change. */
export class MembershipPlanSwitched extends DomainEvent {
  constructor(
    readonly membership: MembershipFacts,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
