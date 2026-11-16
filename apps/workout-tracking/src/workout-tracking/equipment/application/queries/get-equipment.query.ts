import { Query } from '@nestjs/cqrs';
import type { EquipmentId } from '../../domain/values/equipment-id.js';
import type { EquipmentRepresentation } from '../equipment.representation.interface.js';

/** Asks for one piece of equipment by its id. */
export class GetEquipmentQuery extends Query<EquipmentRepresentation> {
  constructor(readonly equipmentId: EquipmentId) {
    super();
  }
}
