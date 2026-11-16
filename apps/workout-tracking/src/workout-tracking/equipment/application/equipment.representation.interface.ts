import type { Equipment } from '../domain/equipment.js';

/** Equipment as the internal REST API shows it. */
export interface EquipmentRepresentation {
  id: string;
  serialNumber: string;
  type: string;
  pairedMemberId: string | null;
  pairedAt: string | null;
  registeredAt: string;
}

/** Turns equipment into the representation the REST API returns. */
export function representEquipment(equipment: Equipment): EquipmentRepresentation {
  const { id, serialNumber, type, pairedMemberId, pairedAt, registeredAt } = equipment.props;
  return {
    id: id.value,
    serialNumber: serialNumber.value,
    type: type.value,
    pairedMemberId: pairedMemberId?.value ?? null,
    pairedAt: pairedAt?.toISOString() ?? null,
    registeredAt: registeredAt.toISOString(),
  };
}
