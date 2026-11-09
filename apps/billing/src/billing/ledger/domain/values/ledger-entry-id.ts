import { generateId, isUuid } from '@app/ddd';

export class LedgerEntryId {
  private constructor(readonly value: string) {}

  static generate(): LedgerEntryId {
    return new LedgerEntryId(generateId());
  }

  static from(value: string): LedgerEntryId {
    if (!isUuid(value)) {
      throw new TypeError(`"${value}" is not a ledger entry id`);
    }
    return new LedgerEntryId(value);
  }

  equals(other: LedgerEntryId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
