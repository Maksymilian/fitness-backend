import type { TrainingGoal } from '../domain/training-goal.js';

/** A training goal as the GraphQL API shows it. Its progress is a separate field, calculated per goal. */
export interface TrainingGoalRepresentation {
  id: string;
  memberId: string;
  metric: string;
  target: number;
  discipline: string | null;
  startsOn: Date;
  endsOn: Date;
  status: string;
  achievedAt: Date | null;
}

/** Turns a training goal into the representation the interfaces return. */
export function representTrainingGoal(goal: TrainingGoal): TrainingGoalRepresentation {
  const p = goal.props;
  return {
    id: p.id.value,
    memberId: p.memberId.value,
    metric: p.metric.value,
    target: p.target.value,
    discipline: p.discipline?.value ?? null,
    startsOn: p.period.startsOn,
    endsOn: p.period.endsOn,
    status: p.status.value,
    achievedAt: p.achievedAt,
  };
}
