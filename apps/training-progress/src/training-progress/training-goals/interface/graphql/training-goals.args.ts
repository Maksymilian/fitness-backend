import { ArgsType, Field } from '@nestjs/graphql';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { GoalStatusEnum } from './goal-status.enum.js';

/** The arguments of a member's `trainingGoals` field. */
@ArgsType()
export class TrainingGoalsArgs {
  @Field(() => GoalStatusEnum, { nullable: true })
  @IsOptional()
  @IsEnum(GoalStatusEnum)
  status?: GoalStatusEnum;

  @Field(() => Date, { nullable: true, description: 'Only the goals set at or after this moment.' })
  @IsOptional()
  @IsDate()
  setSince?: Date;
}
