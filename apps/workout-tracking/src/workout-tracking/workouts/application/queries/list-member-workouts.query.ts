import { Query } from '@nestjs/cqrs';
import type { MemberId } from '../../../equipment/domain/values/member-id.js';
import type { WorkoutPage } from '../workout.representation.interface.js';

/** Asks for a page of a member's workouts, newest first. */
export class ListMemberWorkoutsQuery extends Query<WorkoutPage> {
  constructor(
    readonly memberId: MemberId,
    readonly limit: number,
    readonly cursor: string | null,
  ) {
    super();
  }
}
