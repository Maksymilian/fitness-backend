import { DomainError } from '@app/ddd';

/** Thrown when a recording id is empty or malformed. */
export class InvalidRecordingId extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a recording id: 1 to 128 characters`);
  }
}
