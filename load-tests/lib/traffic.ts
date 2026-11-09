// What the members' apps send, mostly reads: one action per iteration, picked by weight. Reads go
// to any seeded member, recordings to the writers (members.ts), so the verdict can reconcile them.
import { check } from 'k6';
import exec from 'k6/execution';
import { billing, type Recording, trainingProgress, workoutTracking } from './api.ts';
import { anyMember, anyWriter, type Discipline, type Member } from './members.ts';

const between = (first: number, last: number) => first + Math.floor(Math.random() * (last - first + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** Metres per second, roughly, so a recording looks like one. */
const SPEED: Record<Discipline, number> = { CYCLING: 7.5, RUNNING: 2.9, WALKING: 1.4, ROWING: 3.4 };

/** This VU's last new recording, to submit it again: equipment retrying an upload. */
let lastRecording: { member: Member; recording: Recording; workoutId: string } | undefined;

/**
 * A recording on the member's equipment, started now: 201 with a new workout. One in ten submits
 * the VU's previous recording again instead, which returns the same workout (200).
 */
export function recordWorkout(runId: string, member = anyWriter()): void {
  if (lastRecording && Math.random() < 0.1) {
    const { member: previous, recording, workoutId } = lastRecording;
    const response = workoutTracking.record(previous, recording, [200]);
    check(response, { 'a recording submitted again returns its workout': (r) => r.status === 200 && r.json('id') === workoutId });
    return;
  }
  const discipline = pick(member.disciplines);
  const durationSeconds = between(1200, 4800);
  const recording: Recording = {
    recordingId: `${runId}-${exec.vu.idInTest}-${exec.vu.iterationInInstance}`,
    discipline,
    startedAt: new Date().toISOString(),
    durationSeconds,
    distanceMeters: Math.round(durationSeconds * SPEED[discipline]),
    calories: Math.round(durationSeconds / 6),
  };
  const response = workoutTracking.record(member, recording);
  if (response.status === 201) {
    lastRecording = { member, recording, workoutId: response.json('id') as string };
  }
}

/** A goal for this month and the next: the member's goals, and their progress, grow by one. */
function setTrainingGoal(member: Member): void {
  const now = new Date();
  trainingProgress.setTrainingGoal({
    memberId: member.id,
    metric: pick(['DISTANCE', 'DURATION', 'CALORIES', 'WORKOUT_COUNT'] as const),
    target: between(10, 100_000),
    startsOn: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    endsOn: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1)).toISOString(),
  });
}

/** [weight, action]: reads 95, writes 10. */
const ACTIONS: [weight: number, action: (runId: string) => void][] = [
  // Reads: REST
  [10, () => {
    // The member's history, then one workout of it, as an admin tool would.
    const { workouts } = workoutTracking.workouts(anyMember());
    if (workouts.length > 0) {
      workoutTracking.workout(pick(workouts).id);
    }
  }],
  [5, () => workoutTracking.workouts(anyMember(), 100)],
  [5, () => workoutTracking.equipment(anyMember().equipmentId)],
  // Reads: GraphQL
  [30, () => trainingProgress.memberProgress(anyMember())],
  [15, () => {
    const log = trainingProgress.trainingLog(anyMember());
    if (log?.pageInfo.hasNextPage && log.pageInfo.endCursor && Math.random() < 0.3) {
      trainingProgress.trainingLog(anyMember(), 20, log.pageInfo.endCursor);
    }
  }],
  [15, () => trainingProgress.progressSummaries(anyMember())],
  [10, () => trainingProgress.trainingGoals(anyMember())],
  // Reads: Billing (REST), the membership page
  [3, () => billing.membership(anyMember())],
  [2, () => billing.ledger(anyMember())],
  // Writes: a recording (REST, then an integration event to Training Progress), a goal (GraphQL)
  [7, (runId) => recordWorkout(runId)],
  [3, () => setTrainingGoal(anyMember())],
];
const TOTAL = ACTIONS.reduce((sum, [weight]) => sum + weight, 0);

export function mixedTraffic(runId: string): void {
  let roll = Math.random() * TOTAL;
  for (const [weight, action] of ACTIONS) {
    roll -= weight;
    if (roll < 0) {
      return action(runId);
    }
  }
}
