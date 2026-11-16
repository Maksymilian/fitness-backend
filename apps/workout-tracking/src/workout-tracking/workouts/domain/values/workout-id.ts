import { generateId, isUuid } from '@app/ddd';

/** Identifies a workout: a UUIDv7 the domain generates. */
export class WorkoutId {
  private constructor(readonly value: string) {}

  static generate(): WorkoutId {
    return new WorkoutId(generateId());
  }

  static from(value: string): WorkoutId {
    if (!isUuid(value)) {
      throw new TypeError(`"${value}" is not a workout id`);
    }
    return new WorkoutId(value);
  }

  equals(other: WorkoutId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
