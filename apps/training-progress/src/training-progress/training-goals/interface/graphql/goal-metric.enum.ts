import { registerEnumType } from '@nestjs/graphql';

/** The goal metrics in the GraphQL schema. */
export enum GoalMetricEnum {
  DISTANCE = 'DISTANCE',
  DURATION = 'DURATION',
  CALORIES = 'CALORIES',
  WORKOUT_COUNT = 'WORKOUT_COUNT',
}

registerEnumType(GoalMetricEnum, { name: 'GoalMetric' });
