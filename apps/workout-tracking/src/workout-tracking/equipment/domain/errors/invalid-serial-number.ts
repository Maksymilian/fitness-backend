import { DomainError } from '@app/ddd';

/** Thrown when a serial number is empty or malformed. */
export class InvalidSerialNumber extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a serial number: 1 to 64 letters, digits or dashes`);
  }
}
