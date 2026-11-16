import { ConcurrencyConflict, type Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import { type Database, drizzleTransaction, isUniqueViolation } from '../../../platform/database/database.js';
import { workoutCorrections, workouts } from '../../../platform/database/schema.js';
import { EquipmentId } from '../../equipment/domain/values/equipment-id.js';
import { EquipmentType } from '../../equipment/domain/values/equipment-type.js';
import { MemberId } from '../../equipment/domain/values/member-id.js';
import { DuplicateRecording } from '../domain/errors/duplicate-recording.js';
import { WorkoutNotFound } from '../domain/errors/workout-not-found.js';
import { Discipline } from '../domain/values/discipline.js';
import { RecordingId } from '../domain/values/recording-id.js';
import { VoidReason } from '../domain/values/void-reason.js';
import { WorkoutId } from '../domain/values/workout-id.js';
import { WorkoutMetrics } from '../domain/values/workout-metrics.js';
import { WorkoutStatus } from '../domain/values/workout-status.js';
import { Workout } from '../domain/workout.js';
import { WorkoutRepository } from '../domain/workout.repository.js';

type WorkoutRow = typeof workouts.$inferSelect;

/** Stores workouts and their corrections in PostgreSQL with Drizzle, with optimistic locking on `revision`. */
@Injectable()
export class DrizzleWorkoutRepository extends WorkoutRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async get(id: WorkoutId): Promise<Workout> {
    const [row] = await this.db.select().from(workouts).where(eq(workouts.id, id.value));
    if (!row) {
      throw new WorkoutNotFound(id.value);
    }
    return toWorkout(row);
  }

  async findByRecording(equipmentId: EquipmentId, recordingId: RecordingId): Promise<Workout | undefined> {
    const [row] = await this.db
      .select()
      .from(workouts)
      .where(and(eq(workouts.equipmentId, equipmentId.value), eq(workouts.recordingId, recordingId.value)));
    return row && toWorkout(row);
  }

  async save(transaction: Transaction, workout: Workout): Promise<void> {
    const tx = drizzleTransaction(transaction);
    const p = workout.props;
    const changing = {
      durationSeconds: p.metrics.duration.seconds,
      distanceMeters: p.metrics.distance.meters,
      calories: p.metrics.calories.kilocalories,
      status: p.status.value,
      revision: p.revision,
      voidReason: p.voidReason?.value ?? null,
      voidedAt: p.voidedAt,
    };
    if (workout.version === 0) {
      try {
        await tx.insert(workouts).values({
          id: p.id.value,
          equipmentId: p.equipmentId.value,
          equipmentType: p.equipmentType.value,
          recordingId: p.recordingId.value,
          memberId: p.memberId.value,
          discipline: p.discipline.value,
          startedAt: p.startedAt,
          recordedAt: p.recordedAt,
          ...changing,
        });
      } catch (error) {
        if (isUniqueViolation(error, 'workouts_equipment_recording_unique')) {
          throw new DuplicateRecording(p.equipmentId.value, p.recordingId.value);
        }
        throw error;
      }
    } else {
      const updated = await tx
        .update(workouts)
        .set(changing)
        .where(and(eq(workouts.id, p.id.value), eq(workouts.revision, workout.version)))
        .returning({ id: workouts.id });
      if (updated.length === 0) {
        throw new ConcurrencyConflict('Workout', p.id.value);
      }
    }
    if (workout.newCorrections.length > 0) {
      await tx.insert(workoutCorrections).values(
        workout.newCorrections.map((correction) => ({
          workoutId: p.id.value,
          revision: correction.revision,
          previousMetrics: metricsColumns(correction.previousMetrics),
          newMetrics: metricsColumns(correction.newMetrics),
          reason: correction.reason.value,
          correctedAt: correction.correctedAt,
        })),
      );
    }
  }
}

function metricsColumns(metrics: WorkoutMetrics) {
  return {
    durationSeconds: metrics.duration.seconds,
    distanceMeters: metrics.distance.meters,
    calories: metrics.calories.kilocalories,
  };
}

function toWorkout(row: WorkoutRow): Workout {
  return Workout.reconstitute({
    id: WorkoutId.from(row.id),
    equipmentId: EquipmentId.from(row.equipmentId),
    equipmentType: EquipmentType.from(row.equipmentType),
    recordingId: RecordingId.from(row.recordingId),
    memberId: MemberId.from(row.memberId),
    discipline: Discipline.from(row.discipline),
    startedAt: row.startedAt,
    metrics: WorkoutMetrics.of(row),
    status: WorkoutStatus.from(row.status),
    revision: row.revision,
    recordedAt: row.recordedAt,
    voidReason: row.voidReason === null ? null : VoidReason.from(row.voidReason),
    voidedAt: row.voidedAt,
  });
}
