import { DomainError } from '@app/ddd';

/** Thrown when equipment with the same serial number is already registered. */
export class SerialNumberAlreadyRegistered extends DomainError {
  readonly kind = 'conflict';

  constructor(serialNumber: string) {
    super(`Equipment with serial number ${serialNumber} is already registered`);
  }
}
