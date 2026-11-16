import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { equipment } from '../../../platform/database/schema.js';
import { EquipmentQueries } from '../application/queries/equipment-queries.js';
import type { EquipmentRepresentation } from '../application/equipment.representation.interface.js';

/** Reads equipment with SQL, bypassing the domain model. */
@Injectable()
export class DrizzleEquipmentQueries extends EquipmentQueries {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async byId(equipmentId: string): Promise<EquipmentRepresentation | undefined> {
    const [row] = await this.db.select().from(equipment).where(eq(equipment.id, equipmentId));
    return (
      row && {
        id: row.id,
        serialNumber: row.serialNumber,
        type: row.type,
        pairedMemberId: row.pairedMemberId,
        pairedAt: row.pairedAt?.toISOString() ?? null,
        registeredAt: row.registeredAt.toISOString(),
      }
    );
  }
}
