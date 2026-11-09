import { Module } from '@nestjs/common';
import { StripeAclModule } from '../stripe-acl/stripe-acl.module.js';
import { ApplyPaymentPolicy } from './application/apply-payment.policy.js';
import { ChangeMembershipHandler } from './application/commands/change-membership.handler.js';
import { OpenBillingPortalHandler } from './application/commands/open-billing-portal.handler.js';
import { StartCheckoutHandler } from './application/commands/start-checkout.handler.js';
import { MembershipHandler } from './application/queries/membership.handler.js';
import { MembershipQueries } from './application/queries/membership-queries.js';
import { MembershipRepository } from './domain/membership.repository.js';
import { DrizzleMembershipQueries } from './infrastructure/drizzle-membership-queries.js';
import { DrizzleMembershipRepository } from './infrastructure/drizzle-membership.repository.js';
import { MembershipController } from './interface/http/membership.controller.js';

@Module({
  // The payment provider's adapter is the anticorruption layer's.
  imports: [StripeAclModule],
  controllers: [MembershipController],
  providers: [
    StartCheckoutHandler,
    OpenBillingPortalHandler,
    ChangeMembershipHandler,
    ApplyPaymentPolicy,
    MembershipHandler,
    { provide: MembershipRepository, useClass: DrizzleMembershipRepository },
    { provide: MembershipQueries, useClass: DrizzleMembershipQueries },
  ],
})
export class MembershipsModule {}
