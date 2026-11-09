import type { Transaction } from '@app/ddd';
import type { LedgerEntry } from './ledger-entry.js';

/** Port: records `LedgerEntry` aggregates. Never updates one: entries don't change. */
export abstract class LedgerEntryRepository {
  /**
   * Inserts the entry through the transaction.
   * @throws LedgerEntryAlreadyRecorded when an entry of its kind has its provider reference
   */
  abstract add(tx: Transaction, entry: LedgerEntry): Promise<void>;
}
