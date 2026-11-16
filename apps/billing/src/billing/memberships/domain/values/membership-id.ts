import { generateId, isUuid } from '@app/ddd';

/** Identifies a membership: a UUIDv7 the domain generates. */
export class MembershipId {
  private constructor(readonly value: string) {}

  static generate(): MembershipId {
    return new MembershipId(generateId());
  }

  static from(value: string): MembershipId {
    if (!isUuid(value)) {
      throw new TypeError(`"${value}" is not a membership id`);
    }
    return new MembershipId(value);
  }

  equals(other: MembershipId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
