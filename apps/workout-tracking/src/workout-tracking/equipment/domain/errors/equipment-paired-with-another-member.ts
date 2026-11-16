import { DomainError } from '@app/ddd';

/** Thrown when equipment is paired with a member while it is still paired with another one. */
export class EquipmentPairedWithAnotherMember extends DomainError {
  readonly kind = 'conflict';

  constructor(equipmentId: string) {
    super(`Equipment ${equipmentId} is paired with another member; unpair it first`);
  }
}
