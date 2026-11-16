import { DomainEvent } from '@app/ddd';
import { EquipmentId } from '../values/equipment-id.js';
import { MemberId } from '../values/member-id.js';

/** Equipment was unpaired from its member. */
export class EquipmentUnpaired extends DomainEvent {
  constructor(
    readonly equipmentId: EquipmentId,
    /** The member the equipment was paired with until now. */
    readonly memberId: MemberId,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
