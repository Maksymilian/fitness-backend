import { InvalidSourceRevision } from '../errors/invalid-source-revision.js';

/** The upstream's revision at the time of the last change (a workout's, a membership's). A change with an older or equal one is ignored. */
export class SourceRevision {
  private constructor(readonly value: number) {}

  static of(value: number): SourceRevision {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new InvalidSourceRevision(value);
    }
    return new SourceRevision(value);
  }

  isNewerThan(other: SourceRevision): boolean {
    return this.value > other.value;
  }

  equals(other: SourceRevision): boolean {
    return this.value === other.value;
  }
}
