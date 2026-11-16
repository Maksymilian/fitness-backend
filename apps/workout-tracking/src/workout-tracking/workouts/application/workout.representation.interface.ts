import type { Workout } from '../domain/workout.js';

/** A workout as the internal REST API shows it. */
export interface WorkoutRepresentation {
  id: string;
  equipmentId: string;
  equipmentType: string;
  recordingId: string;
  memberId: string;
  discipline: string;
  startedAt: string;
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
  status: string;
  revision: number;
  voidReason: string | null;
  voidedAt: string | null;
  recordedAt: string;
}

/** One page of a member's workouts, newest first. `nextCursor` is null on the last page. */
export interface WorkoutPage {
  workouts: WorkoutRepresentation[];
  nextCursor: string | null;
}

/** Turns a workout into the representation the REST API returns. */
export function representWorkout(workout: Workout): WorkoutRepresentation {
  const p = workout.props;
  return {
    id: p.id.value,
    equipmentId: p.equipmentId.value,
    equipmentType: p.equipmentType.value,
    recordingId: p.recordingId.value,
    memberId: p.memberId.value,
    discipline: p.discipline.value,
    startedAt: p.startedAt.toISOString(),
    durationSeconds: p.metrics.duration.seconds,
    distanceMeters: p.metrics.distance.meters,
    calories: p.metrics.calories.kilocalories,
    status: p.status.value,
    revision: p.revision,
    voidReason: p.voidReason?.value ?? null,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    recordedAt: p.recordedAt.toISOString(),
  };
}
