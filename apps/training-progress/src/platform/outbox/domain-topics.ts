/**
 * Topics of the domain events that stay inside Training Progress, for its policies and the cache
 * invalidation. Versioned: during a rolling deploy, the previous release's messages can reach the new one.
 */
export const DomainTopics = {
  workoutLoggedV1: 'training-progress.domain.workout-logged.v1',
  loggedWorkoutRevisedV1: 'training-progress.domain.logged-workout-revised.v1',
  loggedWorkoutStoppedCountingV1: 'training-progress.domain.logged-workout-stopped-counting.v1',
  personalRecordSetV1: 'training-progress.domain.personal-record-set.v1',
  personalRecordWithdrawnV1: 'training-progress.domain.personal-record-withdrawn.v1',
  trainingGoalSetV1: 'training-progress.domain.training-goal-set.v1',
} as const;

/** Payload of the logged workout topics. `previous*` only on a revision. */
export interface LoggedWorkoutPayloadV1 {
  loggedWorkoutId: string;
  memberId: string;
  discipline: string;
  startedAt: string;
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
}

/** The outbox payload of personal records changes: whose records changed, in which discipline. */
export interface PersonalRecordsPayloadV1 {
  memberId: string;
  discipline: string;
}

/** The outbox payload of a training goal that was set. */
export interface TrainingGoalSetPayloadV1 {
  trainingGoalId: string;
  memberId: string;
}
