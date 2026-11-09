import { Command } from '@nestjs/cqrs';
import type { MembershipPlan } from '../../domain/values/membership-plan.js';
import type { ProviderReference } from '../../domain/values/provider-reference.js';

/** What the payment provider reports about a membership, in Billing's language. */
export type MembershipChange = { kind: 'cancel' } | { kind: 'resume' } | { kind: 'switch-plan'; plan: MembershipPlan } | { kind: 'end' };

/**
 * Cancel, Resume, Switch Plan or End the membership the provider knows by `providerReference`
 * (Stripe's subscription). `messageId` is the provider's event id: applied once.
 */
export class ChangeMembershipCommand extends Command<{ duplicate: boolean }> {
  constructor(
    readonly providerReference: ProviderReference,
    readonly change: MembershipChange,
    readonly messageId: string,
  ) {
    super();
  }
}
