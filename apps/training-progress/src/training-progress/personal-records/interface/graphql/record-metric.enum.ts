import { registerEnumType } from '@nestjs/graphql';

/** The record metrics in the GraphQL schema. */
export enum RecordMetricEnum {
  LONGEST_DISTANCE = 'LONGEST_DISTANCE',
  LONGEST_DURATION = 'LONGEST_DURATION',
  MOST_CALORIES = 'MOST_CALORIES',
}

registerEnumType(RecordMetricEnum, { name: 'RecordMetric' });
