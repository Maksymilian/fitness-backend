import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EquipmentNotFound } from '../../domain/errors/equipment-not-found.js';
import { EquipmentQueries } from './equipment-queries.js';
import { GetEquipmentQuery } from './get-equipment.query.js';

/** Answers a `GetEquipmentQuery` from SQL. */
@QueryHandler(GetEquipmentQuery)
export class GetEquipmentHandler implements IQueryHandler<GetEquipmentQuery> {
  constructor(private readonly equipmentQueries: EquipmentQueries) {}

  async execute({ equipmentId }: GetEquipmentQuery) {
    const equipment = await this.equipmentQueries.byId(equipmentId.value);
    if (!equipment) {
      throw new EquipmentNotFound(equipmentId.value);
    }
    return equipment;
  }
}
