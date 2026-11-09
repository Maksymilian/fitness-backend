import { DomainEvent } from '@app/ddd';
import type { MembershipFacts } from './membership-facts.interface.js';

/** A payment for the next period moved the membership's paid through forward. Carries the membership after the change. */
export class MembershipRenewed extends DomainEvent {
  constructor(
    readonly membership: MembershipFacts,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
