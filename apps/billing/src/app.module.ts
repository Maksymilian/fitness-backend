import { Module } from '@nestjs/common';
import { LedgerModule } from './billing/ledger/ledger.module.js';
import { MembershipsModule } from './billing/memberships/memberships.module.js';
import { StripeAclModule } from './billing/stripe-acl/stripe-acl.module.js';
import { PlatformModule } from './platform/platform.module.js';

/** Composition root of the Billing service. */
@Module({
  imports: [PlatformModule, MembershipsModule, LedgerModule, StripeAclModule],
})
export class AppModule {}
