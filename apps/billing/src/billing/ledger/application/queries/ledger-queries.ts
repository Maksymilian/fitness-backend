import type { LedgerPage } from '../ledger.representation.interface.js';

/** Read port: the ledger read straight from SQL, bypassing the domain model. */
export abstract class LedgerQueries {
  /** A member's ledger entries, newest first, with keyset pagination on (occurred at, id). */
  abstract ofMember(memberId: string, limit: number, cursor: string | null): Promise<LedgerPage>;
}
