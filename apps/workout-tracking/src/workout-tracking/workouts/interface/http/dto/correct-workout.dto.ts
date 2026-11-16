import { IsInt, IsString, Length } from 'class-validator';

/** The body of a correction: the corrected metrics and the reason. */
export class CorrectWorkoutDto {
  @IsInt()
  durationSeconds: number;

  @IsInt()
  distanceMeters: number;

  @IsInt()
  calories: number;

  @IsString()
  @Length(1, 500)
  reason: string;
}
