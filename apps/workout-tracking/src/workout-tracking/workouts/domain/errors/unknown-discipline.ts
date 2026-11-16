import { DomainError } from '@app/ddd';

/** Thrown when a discipline isn't one Workout Tracking knows. */
export class UnknownDiscipline extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a discipline: CYCLING, RUNNING, WALKING or ROWING`);
  }
}
