import { Field, InputType, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsDate, IsEmail, IsEnum, IsInt, IsOptional } from 'class-validator';
import { DisciplineEnum } from '../../../training-log/interface/graphql/discipline.enum.js';
import { GoalMetricEnum } from './goal-metric.enum.js';

/** The input of the `setTrainingGoal` mutation. */
@InputType()
export class SetTrainingGoalInput {
  /** Until Identity exists, a member is identified by their email address (not verified). */
  @Field(() => String)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  memberId: string;

  @Field(() => GoalMetricEnum)
  @IsEnum(GoalMetricEnum)
  metric: GoalMetricEnum;

  @Field(() => Int)
  @IsInt()
  target: number;

  @Field(() => DisciplineEnum, { nullable: true })
  @IsOptional()
  @IsEnum(DisciplineEnum)
  discipline?: DisciplineEnum;

  @Field()
  @IsDate()
  startsOn: Date;

  @Field()
  @IsDate()
  endsOn: Date;
}
