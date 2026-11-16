import { DomainEvent } from '@app/ddd';
import { EquipmentId } from '../values/equipment-id.js';
import { EquipmentType } from '../values/equipment-type.js';
import { SerialNumber } from '../values/serial-number.js';

/** Equipment was registered with its serial number and type. */
export class EquipmentRegistered extends DomainEvent {
  constructor(
    readonly equipmentId: EquipmentId,
    readonly serialNumber: SerialNumber,
    readonly equipmentType: EquipmentType,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
