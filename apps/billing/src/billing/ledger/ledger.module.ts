import { Module } from '@nestjs/common';
import { RecordPaymentHandler } from './application/commands/record-payment.handler.js';
import { RecordRefundHandler } from './application/commands/record-refund.handler.js';
import { LedgerHandler } from './application/queries/ledger.handler.js';
import { LedgerQueries } from './application/queries/ledger-queries.js';
import { LedgerEntryRepository } from './domain/ledger-entry.repository.js';
import { DrizzleLedgerEntryRepository } from './infrastructure/drizzle-ledger-entry.repository.js';
import { DrizzleLedgerQueries } from './infrastructure/drizzle-ledger-queries.js';
import { LedgerController } from './interface/http/ledger.controller.js';

@Module({
  controllers: [LedgerController],
  providers: [
    RecordPaymentHandler,
    RecordRefundHandler,
    LedgerHandler,
    { provide: LedgerEntryRepository, useClass: DrizzleLedgerEntryRepository },
    { provide: LedgerQueries, useClass: DrizzleLedgerQueries },
  ],
})
export class LedgerModule {}
