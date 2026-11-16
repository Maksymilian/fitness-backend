import { Command } from '@nestjs/cqrs';
import type { MemberId } from '../../domain/values/member-id.js';
import type { MembershipPlan } from '../../domain/values/membership-plan.js';
import type { ProviderPage } from '../payment-provider.js';

/** Asks for a payment provider checkout page where the member pays for a membership plan. */
export class StartCheckoutCommand extends Command<ProviderPage> {
  constructor(
    readonly memberId: MemberId,
    readonly plan: MembershipPlan,
  ) {
    super();
  }
}
