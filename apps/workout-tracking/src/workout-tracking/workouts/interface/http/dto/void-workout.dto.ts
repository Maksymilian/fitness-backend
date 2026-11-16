import { IsString, Length } from 'class-validator';

/** The body of a void: the reason. */
export class VoidWorkoutDto {
  @IsString()
  @Length(1, 500)
  reason: string;
}
