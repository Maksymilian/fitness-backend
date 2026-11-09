import { DomainEvent } from '@app/ddd';
import type { MembershipFacts } from './membership-facts.interface.js';

/** The member turned renewal on again. Carries the membership after the change. */
export class MembershipResumed extends DomainEvent {
  constructor(
    readonly membership: MembershipFacts,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
