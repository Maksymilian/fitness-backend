/** A ledger entry, as the REST API shows it. The amount is text, "9.99": exact, never a float. */
export interface LedgerEntryRepresentation {
  id: string;
  kind: string;
  amount: string;
  currency: string;
  occurredAt: string;
  plan: string | null;
  paidThrough: string | null;
}

/** One page of a member's ledger, newest first. `nextCursor` is null on the last page. */
export interface LedgerPage {
  entries: LedgerEntryRepresentation[];
  nextCursor: string | null;
}
