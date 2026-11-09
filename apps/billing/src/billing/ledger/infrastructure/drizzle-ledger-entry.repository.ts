import type { Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { drizzleTransaction, isUniqueViolation } from '../../../platform/database/database.js';
import { ledgerEntries } from '../../../platform/database/schema.js';
import { LedgerEntryAlreadyRecorded } from '../domain/errors/ledger-entry-already-recorded.js';
import type { LedgerEntry } from '../domain/ledger-entry.js';
import { LedgerEntryRepository } from '../domain/ledger-entry.repository.js';

@Injectable()
export class DrizzleLedgerEntryRepository extends LedgerEntryRepository {
  async add(transaction: Transaction, entry: LedgerEntry): Promise<void> {
    const p = entry.props;
    try {
      await drizzleTransaction(transaction)
        .insert(ledgerEntries)
        .values({
          id: p.id.value,
          memberId: p.memberId.value,
          kind: p.kind.value,
          // NUMERIC(10,2) as text: the exact decimal, never a float.
          amount: p.amount.toFixed(),
          currency: p.amount.currency.code,
          occurredAt: p.occurredAt,
          providerReference: p.providerReference.value,
          plan: p.paidFor?.plan.value ?? null,
          paidThrough: p.paidFor?.paidThrough ?? null,
          membershipReference: p.paidFor?.membershipReference.value ?? null,
          recordedAt: p.recordedAt,
        });
    } catch (error) {
      if (isUniqueViolation(error, 'ledger_entries_provider_reference_unique')) {
        throw new LedgerEntryAlreadyRecorded(p.kind.value, p.providerReference.value);
      }
      throw error;
    }
  }
}
