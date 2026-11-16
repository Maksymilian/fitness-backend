import { TrainingProgressTopics } from '../../training-progress/published-language/topics.js';
import { toGoalAchievedV1, toPersonalRecordSetV1 } from '../../training-progress/published-language/mappers.js';
import { PersonalRecordSet } from '../../training-progress/personal-records/domain/events/personal-record-set.js';
import { PersonalRecordWithdrawn } from '../../training-progress/personal-records/domain/events/personal-record-withdrawn.js';
import { LoggedWorkoutRevised } from '../../training-progress/training-log/domain/events/logged-workout-revised.js';
import { LoggedWorkoutStoppedCounting } from '../../training-progress/training-log/domain/events/logged-workout-stopped-counting.js';
import { WorkoutLogged } from '../../training-progress/training-log/domain/events/workout-logged.js';
import { GoalAchieved } from '../../training-progress/training-goals/domain/events/goal-achieved.js';
import { TrainingGoalSet } from '../../training-progress/training-goals/domain/events/training-goal-set.js';
import { DomainTopics, type LoggedWorkoutPayloadV1 } from './domain-topics.js';
import { RouteTable } from './route-table.js';

const loggedWorkout = (
  event: WorkoutLogged | LoggedWorkoutRevised | LoggedWorkoutStoppedCounting,
  metrics?: WorkoutLogged['metrics'],
): LoggedWorkoutPayloadV1 => ({
  loggedWorkoutId: event.loggedWorkoutId.value,
  memberId: event.memberId.value,
  discipline: event.discipline.value,
  startedAt: event.startedAt.toISOString(),
  durationSeconds: metrics?.duration.seconds ?? 0,
  distanceMeters: metrics?.distance.meters ?? 0,
  calories: metrics?.calories.kilocalories ?? 0,
});

/**
 * Which domain events become which outbox messages (architecture 4.1). Logged workout events are
 * keyed by member, so personal records and goals see a member's workouts in order. The published
 * language for Notifications has no key: a mail outage must not hold back a member's progress.
 * GoalMissed and GoalAbandoned have no subscriber yet, so they aren't written.
 */
export const trainingProgressRoutes = new RouteTable()
  .route(WorkoutLogged, {
    topic: DomainTopics.workoutLoggedV1,
    key: (event) => event.memberId.value,
    payload: (event) => loggedWorkout(event, event.metrics),
  })
  .route(LoggedWorkoutRevised, {
    topic: DomainTopics.loggedWorkoutRevisedV1,
    key: (event) => event.memberId.value,
    payload: (event) => loggedWorkout(event, event.metrics),
  })
  .route(LoggedWorkoutStoppedCounting, {
    topic: DomainTopics.loggedWorkoutStoppedCountingV1,
    key: (event) => event.memberId.value,
    payload: (event) => loggedWorkout(event),
  })
  .route(
    PersonalRecordSet,
    {
      topic: DomainTopics.personalRecordSetV1,
      key: () => null,
      payload: (event) => ({ memberId: event.memberId.value, discipline: event.discipline.value }),
    },
    { topic: TrainingProgressTopics.personalRecordSetV1, key: () => null, payload: toPersonalRecordSetV1 },
  )
  .route(PersonalRecordWithdrawn, {
    topic: DomainTopics.personalRecordWithdrawnV1,
    key: () => null,
    payload: (event) => ({ memberId: event.memberId.value, discipline: event.discipline.value }),
  })
  .route(TrainingGoalSet, {
    topic: DomainTopics.trainingGoalSetV1,
    key: (event) => event.memberId.value,
    payload: (event) => ({ trainingGoalId: event.trainingGoalId.value, memberId: event.memberId.value }),
  })
  .route(GoalAchieved, { topic: TrainingProgressTopics.goalAchievedV1, key: () => null, payload: toGoalAchievedV1 });
