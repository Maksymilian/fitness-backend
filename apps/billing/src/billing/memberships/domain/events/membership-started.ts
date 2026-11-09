import { DomainEvent } from '@app/ddd';
import type { MembershipFacts } from './membership-facts.interface.js';

/** A membership started with its first payment, or started again after it ended. Carries the membership after the change. */
export class MembershipStarted extends DomainEvent {
  constructor(
    readonly membership: MembershipFacts,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
