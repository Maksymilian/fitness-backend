import { InvalidMemberId } from '../errors/invalid-member-id.js';

/**
 * Identifies a member in Billing. Holds the identity provider's subject id, an opaque string; until
 * Identity exists, the member's email address (unverified), checked at the boundary.
 */
export class MemberId {
  private constructor(readonly value: string) {}

  static from(value: string): MemberId {
    if (value.length === 0 || value.length > 320 || /\s/.test(value)) {
      throw new InvalidMemberId(value);
    }
    return new MemberId(value);
  }

  equals(other: MemberId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
