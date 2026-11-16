import { DomainError } from '@app/ddd';

/** Thrown when no equipment has the given id. */
export class EquipmentNotFound extends DomainError {
  readonly kind = 'not-found';

  constructor(equipmentId: string) {
    super(`Equipment ${equipmentId} is not registered`);
  }
}
