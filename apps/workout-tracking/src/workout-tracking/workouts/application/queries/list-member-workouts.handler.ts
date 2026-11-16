import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListMemberWorkoutsQuery } from './list-member-workouts.query.js';
import { WorkoutQueries } from './workout-queries.js';

/** Answers a `ListMemberWorkoutsQuery` from SQL. */
@QueryHandler(ListMemberWorkoutsQuery)
export class ListMemberWorkoutsHandler implements IQueryHandler<ListMemberWorkoutsQuery> {
  constructor(private readonly workoutQueries: WorkoutQueries) {}

  execute({ memberId, limit, cursor }: ListMemberWorkoutsQuery) {
    return this.workoutQueries.ofMember(memberId.value, limit, cursor);
  }
}
