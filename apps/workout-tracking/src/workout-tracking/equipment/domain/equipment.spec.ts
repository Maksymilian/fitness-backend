import { Discipline } from '../../workouts/domain/values/discipline.js';
import { Recording } from '../../workouts/domain/values/recording.js';
import { RecordingId } from '../../workouts/domain/values/recording-id.js';
import { WorkoutMetrics } from '../../workouts/domain/values/workout-metrics.js';
import { Equipment } from './equipment.js';
import { DisciplineNotSupported } from './errors/discipline-not-supported.js';
import { EquipmentNotPaired } from './errors/equipment-not-paired.js';
import { EquipmentPairedWithAnotherMember } from './errors/equipment-paired-with-another-member.js';
import { EquipmentPaired } from './events/equipment-paired.js';
import { EquipmentRegistered } from './events/equipment-registered.js';
import { EquipmentUnpaired } from './events/equipment-unpaired.js';
import { EquipmentType } from './values/equipment-type.js';
import { MemberId } from './values/member-id.js';
import { SerialNumber } from './values/serial-number.js';

const now = new Date('2026-10-08T10:00:00Z');
const ada = MemberId.from('ada@example.com');
const grace = MemberId.from('grace@example.com');

function registeredBike(): Equipment {
  const bike = Equipment.register(SerialNumber.from('BK-001'), EquipmentType.Bike, now);
  bike.pullDomainEvents();
  return bike;
}

function pairedBike(member = ada): Equipment {
  const bike = registeredBike();
  bike.pair(member, now);
  bike.pullDomainEvents();
  return bike;
}

function ride(discipline = Discipline.Cycling) {
  return new Recording(
    RecordingId.from('rec-1'),
    discipline,
    new Date('2026-10-08T09:00:00Z'),
    WorkoutMetrics.of({ durationSeconds: 2700, distanceMeters: 18200, calories: 530 }),
  );
}

describe('Equipment', () => {
  describe('register', () => {
    it('registers unpaired equipment and raises EquipmentRegistered', () => {
      const bike = Equipment.register(SerialNumber.from('bk-001'), EquipmentType.Bike, now);

      const [event] = bike.pullDomainEvents();
      expect(event).toBeInstanceOf(EquipmentRegistered);
      expect(event).toMatchObject({ equipmentId: bike.id, serialNumber: SerialNumber.from('BK-001') });
      expect(bike.props.pairedMemberId).toBeNull();
      expect(bike.version).toBe(0);
    });
  });

  describe('pair', () => {
    it('given unpaired equipment, when paired, then raises EquipmentPaired', () => {
      const bike = registeredBike();

      bike.pair(ada, now);

      expect(bike.pullDomainEvents()).toEqual([expect.any(EquipmentPaired)]);
      expect(bike.props.pairedMemberId).toEqual(ada);
    });

    it('given equipment paired with the member, when paired again, then changes nothing', () => {
      const bike = pairedBike(ada);

      bike.pair(MemberId.from('ada@example.com'), now);

      expect(bike.pullDomainEvents()).toEqual([]);
    });

    it('given equipment paired with another member, when paired, then refuses', () => {
      const bike = pairedBike(ada);

      expect(() => bike.pair(grace, now)).toThrow(EquipmentPairedWithAnotherMember);
    });
  });

  describe('unpair', () => {
    it('given paired equipment, when unpaired, then raises EquipmentUnpaired with the previous member', () => {
      const bike = pairedBike(ada);

      bike.unpair(now);

      const [event] = bike.pullDomainEvents();
      expect(event).toBeInstanceOf(EquipmentUnpaired);
      expect((event as EquipmentUnpaired).memberId).toEqual(ada);
      expect(bike.props.pairedMemberId).toBeNull();
    });

    it('given unpaired equipment, when unpaired, then refuses', () => {
      expect(() => registeredBike().unpair(now)).toThrow(EquipmentNotPaired);
    });
  });

  describe('recordWorkout', () => {
    it('given paired equipment, creates a workout for the paired member and leaves the equipment unchanged', () => {
      const bike = pairedBike(ada);

      const workout = bike.recordWorkout(ride(), now);

      expect(workout.props).toMatchObject({ memberId: ada, equipmentId: bike.id, equipmentType: EquipmentType.Bike, revision: 1 });
      expect(workout.hasChanges()).toBe(true);
      expect(bike.pullDomainEvents()).toEqual([]);
    });

    it('given unpaired equipment, refuses the recording', () => {
      expect(() => registeredBike().recordWorkout(ride(), now)).toThrow(EquipmentNotPaired);
    });

    it('given a discipline the equipment type does not support, refuses the recording', () => {
      expect(() => pairedBike().recordWorkout(ride(Discipline.Rowing), now)).toThrow(DisciplineNotSupported);
    });
  });
});
