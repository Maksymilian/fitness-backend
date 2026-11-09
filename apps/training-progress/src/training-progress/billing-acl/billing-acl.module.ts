import { Module } from '@nestjs/common';
import { BillingEventsController } from './billing-events.controller.js';
import { MembershipSnapshotTranslator } from './membership-snapshot.translator.js';

/** Training Progress' anticorruption layer towards Billing: the only code that knows its contracts. */
@Module({
  controllers: [BillingEventsController],
  providers: [MembershipSnapshotTranslator],
})
export class BillingAclModule {}
