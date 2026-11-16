import { Command } from '@nestjs/cqrs';
import type { EquipmentType } from '../../domain/values/equipment-type.js';
import type { SerialNumber } from '../../domain/values/serial-number.js';
import type { EquipmentRepresentation } from '../equipment.representation.interface.js';

/** Asks to register a new piece of equipment by its serial number and type. */
export class RegisterEquipmentCommand extends Command<EquipmentRepresentation> {
  constructor(
    readonly serialNumber: SerialNumber,
    readonly type: EquipmentType,
  ) {
    super();
  }
}
