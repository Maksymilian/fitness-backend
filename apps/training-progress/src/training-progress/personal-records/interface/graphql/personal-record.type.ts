import { Field, Int, ObjectType } from '@nestjs/graphql';
import { DisciplineEnum } from '../../../training-log/interface/graphql/discipline.enum.js';
import { LoggedWorkoutType } from '../../../training-log/interface/graphql/logged-workout.type.js';
import { RecordMetricEnum } from './record-metric.enum.js';

/** A personal record in the GraphQL schema. */
@ObjectType('PersonalRecord')
export class PersonalRecordType {
  @Field(() => DisciplineEnum)
  discipline: DisciplineEnum;

  @Field(() => RecordMetricEnum)
  metric: RecordMetricEnum;

  /** Meters, seconds or kilocalories, depending on the record metric. */
  @Field(() => Int, { description: 'Meters, seconds or kilocalories, depending on the record metric.' })
  value: number;

  @Field({ description: 'When the logged workout that set the record started.' })
  setAt: Date;

  @Field(() => LoggedWorkoutType)
  loggedWorkout: LoggedWorkoutType;
}
