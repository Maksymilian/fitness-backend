import { Discipline } from '../../../workouts/domain/values/discipline.js';
import { UnknownEquipmentType } from '../errors/unknown-equipment-type.js';

/** How an equipment type is stored and published. */
export type EquipmentTypeName = 'BIKE' | 'TREADMILL' | 'ROWER';

/** What kind of machine equipment is. It decides which disciplines the equipment can record. */
export class EquipmentType {
  static readonly Bike = new EquipmentType('BIKE', [Discipline.Cycling]);
  static readonly Treadmill = new EquipmentType('TREADMILL', [Discipline.Running, Discipline.Walking]);
  static readonly Rower = new EquipmentType('ROWER', [Discipline.Rowing]);

  private static readonly all = [EquipmentType.Bike, EquipmentType.Treadmill, EquipmentType.Rower];

  private constructor(
    readonly value: EquipmentTypeName,
    private readonly supportedDisciplines: readonly Discipline[],
  ) {}

  static from(value: string): EquipmentType {
    const type = EquipmentType.all.find((candidate) => candidate.value === value);
    if (!type) {
      throw new UnknownEquipmentType(value);
    }
    return type;
  }

  /** Whether this type of equipment can record the discipline (a supported discipline). */
  supports(discipline: Discipline): boolean {
    return this.supportedDisciplines.some((supported) => supported.equals(discipline));
  }

  equals(other: EquipmentType): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
