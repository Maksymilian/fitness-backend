/** How a goal status is stored and published. */
export type GoalStatusName = 'ACTIVE' | 'ACHIEVED' | 'MISSED' | 'ABANDONED';

/** Only an active goal can change status. */
export class GoalStatus {
  static readonly Active = new GoalStatus('ACTIVE');
  static readonly Achieved = new GoalStatus('ACHIEVED');
  static readonly Missed = new GoalStatus('MISSED');
  static readonly Abandoned = new GoalStatus('ABANDONED');

  private static readonly all = [GoalStatus.Active, GoalStatus.Achieved, GoalStatus.Missed, GoalStatus.Abandoned];

  private constructor(readonly value: GoalStatusName) {}

  static from(value: string): GoalStatus {
    const status = GoalStatus.all.find((candidate) => candidate.value === value);
    if (!status) {
      throw new TypeError(`"${value}" is not a goal status`);
    }
    return status;
  }

  equals(other: GoalStatus): boolean {
    return this.value === other.value;
  }
}
