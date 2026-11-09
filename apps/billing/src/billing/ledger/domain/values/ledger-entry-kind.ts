export type LedgerEntryKindName = 'PAYMENT' | 'REFUND';

/** A `Payment`: money a member paid, or a `Refund`: money given back to them. */
export class LedgerEntryKind {
  static readonly Payment = new LedgerEntryKind('PAYMENT');
  static readonly Refund = new LedgerEntryKind('REFUND');

  private constructor(readonly value: LedgerEntryKindName) {}

  static from(value: string): LedgerEntryKind {
    if (value === 'PAYMENT') return LedgerEntryKind.Payment;
    if (value === 'REFUND') return LedgerEntryKind.Refund;
    throw new TypeError(`"${value}" is not a ledger entry kind`);
  }

  equals(other: LedgerEntryKind): boolean {
    return this.value === other.value;
  }
}
