import { Command } from '@nestjs/cqrs';
import type { EquipmentId } from '../../domain/values/equipment-id.js';
import type { MemberId } from '../../domain/values/member-id.js';
import type { EquipmentRepresentation } from '../equipment.representation.interface.js';

/** Asks to pair a piece of equipment with a member. */
export class PairEquipmentCommand extends Command<EquipmentRepresentation> {
  constructor(
    readonly equipmentId: EquipmentId,
    readonly memberId: MemberId,
  ) {
    super();
  }
}
