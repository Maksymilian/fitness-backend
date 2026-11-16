import { Command } from '@nestjs/cqrs';
import type { MemberId } from '../../../members/domain/values/member-id.js';
import type { Discipline } from '../../../training-log/domain/values/discipline.js';
import type { GoalMetric } from '../../domain/values/goal-metric.js';
import type { GoalTarget } from '../../domain/values/goal-target.js';
import type { TrainingGoalRepresentation } from '../training-goal.representation.interface.js';

/** Asks to set a training goal for a member: a goal metric, a target and a training period. */
export class SetTrainingGoalCommand extends Command<TrainingGoalRepresentation> {
  constructor(
    readonly memberId: MemberId,
    readonly metric: GoalMetric,
    readonly target: GoalTarget,
    readonly discipline: Discipline | null,
    readonly startsOn: Date,
    readonly endsOn: Date,
  ) {
    super();
  }
}
