import { Query } from '@nestjs/cqrs';
import type { MemberId } from '../../../members/domain/values/member-id.js';
import type { Discipline } from '../../domain/values/discipline.js';
import type { TrainingLogPage } from '../logged-workout.representation.interface.js';

/** Asks for a page of a member's training log, newest first. */
export class TrainingLogQuery extends Query<TrainingLogPage> {
  constructor(
    readonly memberId: MemberId,
    readonly first: number,
    readonly after: string | null,
    readonly discipline: Discipline | null,
  ) {
    super();
  }
}
