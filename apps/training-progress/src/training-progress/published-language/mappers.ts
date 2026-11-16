import type { PersonalRecordSet } from '../personal-records/domain/events/personal-record-set.js';
import type { GoalAchieved } from '../training-goals/domain/events/goal-achieved.js';
import type { GoalAchievedV1, PersonalRecordSetV1 } from './topics.js';

/** Maps the domain event to the published language, so the model can change without breaking consumers. */
export function toPersonalRecordSetV1(event: PersonalRecordSet): PersonalRecordSetV1 {
  return {
    memberId: event.memberId.value,
    discipline: event.discipline.value,
    recordMetric: event.record.metric.value,
    value: event.record.value,
    previousValue: event.previous?.value ?? null,
    loggedWorkoutId: event.record.loggedWorkoutId.value,
    setAt: event.record.setAt.toISOString(),
  };
}

/** Maps a `GoalAchieved` domain event to its published-language form. */
export function toGoalAchievedV1(event: GoalAchieved): GoalAchievedV1 {
  return {
    memberId: event.memberId.value,
    trainingGoalId: event.trainingGoalId.value,
    goalMetric: event.metric.value,
    target: event.target.value,
    discipline: event.discipline?.value ?? null,
    startsOn: event.period.startsOn.toISOString(),
    endsOn: event.period.endsOn.toISOString(),
    achievedAt: event.occurredAt.toISOString(),
  };
}
