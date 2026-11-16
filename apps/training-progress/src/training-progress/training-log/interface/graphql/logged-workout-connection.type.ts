import { Field, ObjectType } from '@nestjs/graphql';
import { LoggedWorkoutType } from './logged-workout.type.js';

/** Where a page of the training log ends, and whether another page follows (Relay connections). */
@ObjectType('PageInfo')
export class PageInfoType {
  @Field()
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

/** A logged workout in a page of the training log, with the cursor that points at it. */
@ObjectType('LoggedWorkoutEdge')
export class LoggedWorkoutEdgeType {
  @Field()
  cursor: string;

  @Field(() => LoggedWorkoutType)
  node: LoggedWorkoutType;
}

/** A page of a member's training log (a Relay connection). */
@ObjectType('LoggedWorkoutConnection')
export class LoggedWorkoutConnectionType {
  @Field(() => [LoggedWorkoutEdgeType])
  edges: LoggedWorkoutEdgeType[];

  @Field(() => PageInfoType)
  pageInfo: PageInfoType;
}
