import { DomainEvent } from '@app/ddd';
import type { MembershipFacts } from './membership-facts.interface.js';

/** The member turned renewal off: the membership ends once it's paid through. Carries the membership after the change. */
export class MembershipCancelled extends DomainEvent {
  constructor(
    readonly membership: MembershipFacts,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
