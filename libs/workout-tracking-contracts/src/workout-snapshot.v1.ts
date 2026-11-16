import { IsDateString, IsIn, IsInt, IsNotEmpty, IsString, IsUUID, Max, Min } from 'class-validator';

/** The equipment types of the published language, version 1. */
export const EQUIPMENT_TYPES_V1 = ['BIKE', 'TREADMILL', 'ROWER'] as const;
/** The disciplines of the published language, version 1. */
export const DISCIPLINES_V1 = ['CYCLING', 'RUNNING', 'WALKING', 'ROWING'] as const;
/** The workout statuses of the published language, version 1. */
export const WORKOUT_STATUSES_V1 = ['RECORDED', 'VOIDED'] as const;

/**
 * The payload of every Workout Tracking integration event: the whole workout as it is after the
 * change (event-carried state transfer), so a consumer never has to call back.
 */
export class WorkoutSnapshotV1 {
  @IsUUID()
  workoutId: string;

  /** The member the workout belongs to: until Identity exists, their email address. */
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsIn(EQUIPMENT_TYPES_V1)
  equipmentType: (typeof EQUIPMENT_TYPES_V1)[number];

  @IsIn(DISCIPLINES_V1)
  discipline: (typeof DISCIPLINES_V1)[number];

  /** ISO 8601, UTC. */
  @IsDateString({ strict: true })
  startedAt: string;

  @IsInt()
  @Min(1)
  @Max(86_400)
  durationSeconds: number;

  @IsInt()
  @Min(0)
  distanceMeters: number;

  @IsInt()
  @Min(0)
  calories: number;

  @IsIn(WORKOUT_STATUSES_V1)
  status: (typeof WORKOUT_STATUSES_V1)[number];

  /** 1 when recorded, plus 1 for every correction or void. */
  @IsInt()
  @Min(1)
  revision: number;
}
