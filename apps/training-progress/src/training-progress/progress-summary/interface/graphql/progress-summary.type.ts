import { Field, Int, ObjectType } from '@nestjs/graphql';
import { DisciplineEnum } from '../../../training-log/interface/graphql/discipline.enum.js';
import { PeriodKindEnum } from './period-kind.enum.js';

/** A progress summary in the GraphQL schema: a member's totals for one training period. */
@ObjectType('ProgressSummary')
export class ProgressSummaryType {
  @Field(() => PeriodKindEnum)
  period: PeriodKindEnum;

  @Field()
  periodStart: Date;

  @Field({ description: 'Exclusive: the start of the next training period.' })
  periodEnd: Date;

  @Field(() => DisciplineEnum, { nullable: true })
  discipline: DisciplineEnum | null;

  @Field(() => Int)
  workoutCount: number;

  @Field(() => Int)
  totalDurationSeconds: number;

  @Field(() => Int)
  totalDistanceMeters: number;

  @Field(() => Int)
  totalCalories: number;
}
