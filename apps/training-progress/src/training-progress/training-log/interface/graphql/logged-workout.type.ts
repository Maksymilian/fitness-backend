import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { DisciplineEnum } from './discipline.enum.js';

/** A logged workout in the GraphQL schema. */
@ObjectType('LoggedWorkout')
export class LoggedWorkoutType {
  @Field(() => ID)
  id: string;

  @Field(() => DisciplineEnum)
  discipline: DisciplineEnum;

  @Field()
  startedAt: Date;

  @Field(() => Int)
  durationSeconds: number;

  @Field(() => Int)
  distanceMeters: number;

  @Field(() => Int)
  calories: number;
}
