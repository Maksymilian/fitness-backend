import { DomainError } from '@app/ddd';

/** Thrown when equipment that isn't paired with a member is asked for something that needs one. */
export class EquipmentNotPaired extends DomainError {
  readonly kind = 'conflict';

  constructor(equipmentId: string) {
    super(`Equipment ${equipmentId} is not paired with a member`);
  }
}
