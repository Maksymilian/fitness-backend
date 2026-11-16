/** How a workout status is stored and published. */
export type WorkoutStatusName = 'RECORDED' | 'VOIDED';

/** `Recorded`, or `Voided`: kept, but final and not counting. */
export class WorkoutStatus {
  static readonly Recorded = new WorkoutStatus('RECORDED');
  static readonly Voided = new WorkoutStatus('VOIDED');

  private constructor(readonly value: WorkoutStatusName) {}

  static from(value: string): WorkoutStatus {
    if (value === 'RECORDED') return WorkoutStatus.Recorded;
    if (value === 'VOIDED') return WorkoutStatus.Voided;
    throw new TypeError(`"${value}" is not a workout status`);
  }

  equals(other: WorkoutStatus): boolean {
    return this.value === other.value;
  }
}
