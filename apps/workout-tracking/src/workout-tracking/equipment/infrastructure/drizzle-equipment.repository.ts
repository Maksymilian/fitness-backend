import { ConcurrencyConflict, type Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import { type Database, drizzleTransaction, isUniqueViolation } from '../../../platform/database/database.js';
import { equipment as equipmentTable } from '../../../platform/database/schema.js';
import { Equipment } from '../domain/equipment.js';
import { EquipmentRepository } from '../domain/equipment.repository.js';
import { EquipmentNotFound } from '../domain/errors/equipment-not-found.js';
import { SerialNumberAlreadyRegistered } from '../domain/errors/serial-number-already-registered.js';
import { EquipmentId } from '../domain/values/equipment-id.js';
import { EquipmentType } from '../domain/values/equipment-type.js';
import { MemberId } from '../domain/values/member-id.js';
import { SerialNumber } from '../domain/values/serial-number.js';

type EquipmentRow = typeof equipmentTable.$inferSelect;

/** Stores equipment in PostgreSQL with Drizzle, with optimistic locking on `version`. */
@Injectable()
export class DrizzleEquipmentRepository extends EquipmentRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async get(id: EquipmentId): Promise<Equipment> {
    const [row] = await this.db.select().from(equipmentTable).where(eq(equipmentTable.id, id.value));
    if (!row) {
      throw new EquipmentNotFound(id.value);
    }
    return toEquipment(row);
  }

  async save(transaction: Transaction, equipment: Equipment): Promise<void> {
    const tx = drizzleTransaction(transaction);
    const { id, serialNumber, type, pairedMemberId, pairedAt, registeredAt } = equipment.props;
    const columns = {
      serialNumber: serialNumber.value,
      type: type.value,
      pairedMemberId: pairedMemberId?.value ?? null,
      pairedAt,
      registeredAt,
      version: equipment.version + 1,
    };
    if (equipment.version === 0) {
      try {
        await tx.insert(equipmentTable).values({ id: id.value, ...columns });
      } catch (error) {
        if (isUniqueViolation(error, 'equipment_serial_number_unique')) {
          throw new SerialNumberAlreadyRegistered(serialNumber.value);
        }
        throw error;
      }
      return;
    }
    const updated = await tx
      .update(equipmentTable)
      .set(columns)
      .where(and(eq(equipmentTable.id, id.value), eq(equipmentTable.version, equipment.version)))
      .returning({ id: equipmentTable.id });
    if (updated.length === 0) {
      throw new ConcurrencyConflict('Equipment', id.value);
    }
  }
}

function toEquipment(row: EquipmentRow): Equipment {
  return Equipment.reconstitute(
    {
      id: EquipmentId.from(row.id),
      serialNumber: SerialNumber.from(row.serialNumber),
      type: EquipmentType.from(row.type),
      pairedMemberId: row.pairedMemberId === null ? null : MemberId.from(row.pairedMemberId),
      pairedAt: row.pairedAt,
      registeredAt: row.registeredAt,
    },
    row.version,
  );
}
