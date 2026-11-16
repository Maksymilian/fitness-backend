import { Command } from '@nestjs/cqrs';
import type { EquipmentId } from '../../domain/values/equipment-id.js';

/** Asks to unpair a piece of equipment from its member. */
export class UnpairEquipmentCommand extends Command<void> {
  constructor(readonly equipmentId: EquipmentId) {
    super();
  }
}
