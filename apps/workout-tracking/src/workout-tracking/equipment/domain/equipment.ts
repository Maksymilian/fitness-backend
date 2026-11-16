import { AggregateRoot } from '@app/ddd';
import type { Recording } from '../../workouts/domain/values/recording.js';
import { Workout } from '../../workouts/domain/workout.js';
import { DisciplineNotSupported } from './errors/discipline-not-supported.js';
import { EquipmentNotPaired } from './errors/equipment-not-paired.js';
import { EquipmentPairedWithAnotherMember } from './errors/equipment-paired-with-another-member.js';
import { EquipmentPaired } from './events/equipment-paired.js';
import { EquipmentRegistered } from './events/equipment-registered.js';
import { EquipmentUnpaired } from './events/equipment-unpaired.js';
import { EquipmentId } from './values/equipment-id.js';
import type { EquipmentType } from './values/equipment-type.js';
import type { MemberId } from './values/member-id.js';
import type { SerialNumber } from './values/serial-number.js';

/** The domain events equipment records. */
export type EquipmentEvent = EquipmentRegistered | EquipmentPaired | EquipmentUnpaired;

/** What equipment holds, as the repository saves and reconstitutes it. */
export interface EquipmentProps {
  readonly id: EquipmentId;
  readonly serialNumber: SerialNumber;
  readonly type: EquipmentType;
  readonly pairedMemberId: MemberId | null;
  readonly pairedAt: Date | null;
  readonly registeredAt: Date;
}

/**
 * A connected fitness machine that records workouts. Paired with at most one member at a time,
 * the member whose workouts it records.
 */
export class Equipment extends AggregateRoot<EquipmentEvent> {
  private wrappedProps: EquipmentProps;

  private constructor(props: EquipmentProps, version: number) {
    super(version);
    this.wrappedProps = props;
  }

  /** Adds new equipment to the platform. The serial number's uniqueness is checked on save. */
  static register(serialNumber: SerialNumber, type: EquipmentType, now: Date): Equipment {
    const equipment = new Equipment({ id: EquipmentId.generate(), serialNumber, type, pairedMemberId: null, pairedAt: null, registeredAt: now }, 0);
    equipment.record(new EquipmentRegistered(equipment.id, serialNumber, type, now));
    return equipment;
  }

  static reconstitute(props: EquipmentProps, version: number): Equipment {
    return new Equipment(props, version);
  }

  get id(): EquipmentId {
    return this.wrappedProps.id;
  }

  get props(): EquipmentProps {
    return this.wrappedProps;
  }

  /**
   * Pairs the equipment with a member. Pairing again with the same member changes nothing;
   * equipment paired with another member must be unpaired first.
   */
  pair(memberId: MemberId, now: Date): void {
    const { pairedMemberId } = this.wrappedProps;
    if (pairedMemberId?.equals(memberId)) {
      return;
    }
    if (pairedMemberId) {
      throw new EquipmentPairedWithAnotherMember(this.id.value);
    }
    this.wrappedProps = { ...this.wrappedProps, pairedMemberId: memberId, pairedAt: now };
    this.record(new EquipmentPaired(this.id, memberId, now));
  }

  unpair(now: Date): void {
    const { pairedMemberId } = this.wrappedProps;
    if (!pairedMemberId) {
      throw new EquipmentNotPaired(this.id.value);
    }
    this.wrappedProps = { ...this.wrappedProps, pairedMemberId: null, pairedAt: null };
    this.record(new EquipmentUnpaired(this.id, pairedMemberId, now));
  }

  /**
   * Factory for a new workout. The equipment must be paired, and the discipline must be one its
   * type supports. The workout belongs to the member paired right now. The equipment itself
   * doesn't change.
   */
  recordWorkout(recording: Recording, now: Date): Workout {
    const { pairedMemberId, type } = this.wrappedProps;
    if (!pairedMemberId) {
      throw new EquipmentNotPaired(this.id.value);
    }
    if (!type.supports(recording.discipline)) {
      throw new DisciplineNotSupported(type.value, recording.discipline.value);
    }
    return Workout.record({ equipmentId: this.id, equipmentType: type, memberId: pairedMemberId, recording, now });
  }
}
