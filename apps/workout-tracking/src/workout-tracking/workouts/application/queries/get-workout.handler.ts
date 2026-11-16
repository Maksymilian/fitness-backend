import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { WorkoutNotFound } from '../../domain/errors/workout-not-found.js';
import { GetWorkoutQuery } from './get-workout.query.js';
import { WorkoutQueries } from './workout-queries.js';

/** Answers a `GetWorkoutQuery` from SQL. */
@QueryHandler(GetWorkoutQuery)
export class GetWorkoutHandler implements IQueryHandler<GetWorkoutQuery> {
  constructor(private readonly workoutQueries: WorkoutQueries) {}

  async execute({ workoutId }: GetWorkoutQuery) {
    const workout = await this.workoutQueries.byId(workoutId.value);
    if (!workout) {
      throw new WorkoutNotFound(workoutId.value);
    }
    return workout;
  }
}
