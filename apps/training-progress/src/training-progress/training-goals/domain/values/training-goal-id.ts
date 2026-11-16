import { generateId, isUuid } from '@app/ddd';

/** Identifies a training goal: a UUIDv7 the domain generates. */
export class TrainingGoalId {
  private constructor(readonly value: string) {}

  static generate(): TrainingGoalId {
    return new TrainingGoalId(generateId());
  }

  static from(value: string): TrainingGoalId {
    if (!isUuid(value)) {
      throw new TypeError(`"${value}" is not a training goal id`);
    }
    return new TrainingGoalId(value.toLowerCase());
  }

  equals(other: TrainingGoalId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
