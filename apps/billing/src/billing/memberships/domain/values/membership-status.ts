export type MembershipStatusName = 'ACTIVE' | 'ENDED';

/** `Active`: paid through a date that hasn't passed, or `Ended`: no access until it starts again. */
export class MembershipStatus {
  static readonly Active = new MembershipStatus('ACTIVE');
  static readonly Ended = new MembershipStatus('ENDED');

  private constructor(readonly value: MembershipStatusName) {}

  static from(value: string): MembershipStatus {
    if (value === 'ACTIVE') return MembershipStatus.Active;
    if (value === 'ENDED') return MembershipStatus.Ended;
    throw new TypeError(`"${value}" is not a membership status`);
  }

  equals(other: MembershipStatus): boolean {
    return this.value === other.value;
  }
}
