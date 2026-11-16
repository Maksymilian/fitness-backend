/** The topic exchange Workout Tracking publishes its integration events to. Owned by Workout Tracking. */
export const WORKOUT_TRACKING_EXCHANGE = 'workout-tracking.integration';

/**
 * Integration event topics: each one is also the CloudEvent `type` and the RabbitMQ routing key.
 * Every payload is a `WorkoutSnapshotV1`.
 */
export const WorkoutTrackingTopics = {
  workoutRecordedV1: 'workout-tracking.integration.workout-recorded.v1',
  workoutCorrectedV1: 'workout-tracking.integration.workout-corrected.v1',
  workoutVoidedV1: 'workout-tracking.integration.workout-voided.v1',
} as const;

/** One of Workout Tracking's integration event topics. */
export type WorkoutTrackingTopic = (typeof WorkoutTrackingTopics)[keyof typeof WorkoutTrackingTopics];

/** Matches every Workout Tracking integration event, for a queue binding. */
export const WORKOUT_TRACKING_ROUTING_PATTERN = 'workout-tracking.integration.#';
