import { Field, HideField, ID, Int, ObjectType } from '@nestjs/graphql';
import { DisciplineEnum } from '../../../training-log/interface/graphql/discipline.enum.js';
import { GoalMetricEnum } from './goal-metric.enum.js';
import { GoalStatusEnum } from './goal-status.enum.js';

/** A training goal in the GraphQL schema, with its progress. */
@ObjectType('TrainingGoal')
export class TrainingGoalType {
  @Field(() => ID)
  id: string;

  @HideField()
  memberId: string;

  @Field(() => GoalMetricEnum)
  metric: GoalMetricEnum;

  @Field(() => Int, { description: 'Meters, seconds, kilocalories or workouts, depending on the goal metric.' })
  target: number;

  @Field(() => DisciplineEnum, { nullable: true })
  discipline: DisciplineEnum | null;

  @Field()
  startsOn: Date;

  @Field({ description: 'Exclusive: workouts that started before this moment count.' })
  endsOn: Date;

  @Field(() => GoalStatusEnum)
  status: GoalStatusEnum;

  @Field(() => Date, { nullable: true })
  achievedAt: Date | null;
}
