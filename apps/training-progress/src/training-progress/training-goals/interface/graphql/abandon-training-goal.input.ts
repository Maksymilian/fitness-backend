import { Field, ID, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsEmail, IsUUID } from 'class-validator';

/** The input of the `abandonTrainingGoal` mutation. */
@InputType()
export class AbandonTrainingGoalInput {
  @Field(() => String)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  memberId: string;

  @Field(() => ID)
  @IsUUID()
  trainingGoalId: string;
}
