import { DomainEvent } from '@app/ddd';
import { EquipmentId } from '../values/equipment-id.js';
import { MemberId } from '../values/member-id.js';

/** Equipment was paired with a member: its workouts are now theirs. */
export class EquipmentPaired extends DomainEvent {
  constructor(
    readonly equipmentId: EquipmentId,
    readonly memberId: MemberId,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
