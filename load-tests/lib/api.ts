// The requests the load tests send: Workout Tracking's and Billing's REST APIs, and Training Progress' GraphQL.
// Every request is tagged with its `name` (one per route or operation, so the summary groups them)
// and its `interface` (rest or graphql), and checked: 5xx and GraphQL errors are counted on their own.
import { check } from 'k6';
import exec from 'k6/execution';
import http, { type RefinedResponse } from 'k6/http';
import { Counter } from 'k6/metrics';
import type { Discipline, Member } from './members.ts';

export const WORKOUT_TRACKING_URL = __ENV.WORKOUT_TRACKING_URL || 'http://localhost:3001';
export const TRAINING_PROGRESS_URL = __ENV.TRAINING_PROGRESS_URL || 'http://localhost:3002';
export const BILLING_URL = __ENV.BILLING_URL || 'http://localhost:3003';

/** Responses with a 5xx status. */
export const serverErrors = new Counter('server_errors');
/** Errors in a GraphQL response, by their code (extensions.code). */
export const graphqlErrors = new Counter('graphql_errors');

/** A response's JSON body, as the API documents it: k6 parses it, nothing checks its shape. */
export function body<T>(response: RefinedResponse<'text'>): T {
  return response.json() as unknown as T;
}

// --- The APIs' shapes, the fields the load tests send and read

/** What equipment submits about a finished workout (POST .../recordings). */
export interface Recording {
  recordingId: string;
  discipline: Discipline;
  startedAt: string;
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
}

/** A workout, from Workout Tracking. */
export interface Workout {
  id: string;
  equipmentId: string;
  recordingId: string;
  startedAt: string;
}

/** A page of a member's workouts, newest first. */
export interface WorkoutPage {
  workouts: Workout[];
  nextCursor: string | null;
}

/** A page of a member's training log, newest first (a GraphQL connection). */
export interface TrainingLogPage {
  edges: { node: { id: string; startedAt: string } }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export type GoalMetric = 'DISTANCE' | 'DURATION' | 'CALORIES' | 'WORKOUT_COUNT';

export interface SetTrainingGoalInput {
  memberId: string;
  metric: GoalMetric;
  target: number;
  startsOn: string;
  endsOn: string;
}

export interface GraphQLError {
  message: string;
  extensions?: { code?: string };
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

const HEADERS = { 'Content-Type': 'application/json' };

function rest(method: string, url: string, payload: object | null, name: string, expected: number[]) {
  const response = http.request(method, url, payload === null ? null : JSON.stringify(payload), {
    headers: HEADERS,
    tags: { name, interface: 'rest' },
    responseCallback: http.expectedStatuses(...expected),
  });
  if (response.status >= 500) {
    serverErrors.add(1, { name });
  }
  check(response, { [`${name} answers ${expected.join(' or ')}`]: (r) => expected.includes(r.status) });
  return response;
}

function graphql<T = unknown>(operationName: string, query: string, variables: Record<string, unknown>): T | undefined {
  const response = http.post(`${TRAINING_PROGRESS_URL}/graphql`, JSON.stringify({ operationName, query, variables }), {
    headers: HEADERS,
    tags: { name: `graphql ${operationName}`, interface: 'graphql' },
  });
  if (response.status >= 500) {
    serverErrors.add(1, { name: `graphql ${operationName}` });
  }
  let result: GraphQLResponse<T> | undefined;
  try {
    result = body<GraphQLResponse<T>>(response);
  } catch {
    result = undefined;
  }
  const errors = result?.errors ?? [];
  for (const error of errors) {
    graphqlErrors.add(1, { name: `graphql ${operationName}`, code: error.extensions?.code ?? 'NONE' });
  }
  if (errors.length > 0 && exec.vu.iterationInScenario < 3) {
    console.warn(`graphql ${operationName}: ${JSON.stringify(errors[0])}`);
  }
  check(response, { [`graphql ${operationName} answers 200 without errors`]: (r) => r.status === 200 && errors.length === 0 });
  return result?.data;
}

// --- Workout Tracking (REST), internal routes

export const workoutTracking = {
  /** A member's workouts, newest first: `{ workouts, nextCursor }`. */
  workouts(member: Member, limit = 20, cursor = ''): WorkoutPage {
    const url = `${WORKOUT_TRACKING_URL}/internal/v1/members/${member.id}/workouts?limit=${limit}&cursor=${encodeURIComponent(cursor)}`;
    const response = rest('GET', url, null, 'GET /internal/v1/members/:memberId/workouts', [200]);
    return response.status === 200 ? body<WorkoutPage>(response) : { workouts: [], nextCursor: null };
  },

  workout(id: string) {
    return rest('GET', `${WORKOUT_TRACKING_URL}/internal/v1/workouts/${id}`, null, 'GET /internal/v1/workouts/:workoutId', [200]);
  },

  equipment(id: string) {
    return rest('GET', `${WORKOUT_TRACKING_URL}/internal/v1/equipment/${id}`, null, 'GET /internal/v1/equipment/:equipmentId', [200]);
  },

  /** 201 with the new workout; 200 with the existing one when the recording was submitted before. */
  record(member: Member, recording: Recording, expected = [201]) {
    const url = `${WORKOUT_TRACKING_URL}/internal/v1/equipment/${member.equipmentId}/recordings`;
    return rest('POST', url, recording, 'POST /internal/v1/equipment/:equipmentId/recordings', expected);
  },
};

// --- Training Progress (GraphQL)

const MEMBER_PROGRESS = `query MemberProgress($id: ID!) {
  member(id: $id) {
    id
    streak
    thisWeek: progressSummary(period: WEEK) { periodStart workoutCount totalDistanceMeters totalDurationSeconds totalCalories }
    personalRecords { discipline metric value setAt }
    trainingGoals(status: ACTIVE) { id metric target progress }
  }
}`;

const TRAINING_LOG = `query TrainingLog($id: ID!, $first: Int, $after: String) {
  member(id: $id) {
    trainingLog(first: $first, after: $after) {
      edges { node { id discipline startedAt durationSeconds distanceMeters calories } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const PROGRESS_SUMMARIES = `query ProgressSummaries($id: ID!) {
  member(id: $id) {
    week: progressSummary(period: WEEK) { periodStart workoutCount totalDistanceMeters }
    month: progressSummary(period: MONTH) { periodStart workoutCount totalDistanceMeters }
    year: progressSummary(period: YEAR) { periodStart workoutCount totalDistanceMeters totalCalories }
  }
}`;

const TRAINING_GOALS = `query TrainingGoals($id: ID!) {
  member(id: $id) {
    trainingGoals { id metric target discipline startsOn endsOn status progress achievedAt }
  }
}`;

const STREAK = `query Streak($id: ID!) {
  member(id: $id) { streak }
}`;

const SET_TRAINING_GOAL = `mutation SetTrainingGoal($input: SetTrainingGoalInput!) {
  setTrainingGoal(input: $input) { id status progress }
}`;

export const trainingProgress = {
  memberProgress: (member: Member) => graphql('MemberProgress', MEMBER_PROGRESS, { id: member.id }),
  trainingLog: (member: Member, first = 20, after = '') =>
    graphql<{ member: { trainingLog: TrainingLogPage } | null }>('TrainingLog', TRAINING_LOG, { id: member.id, first, after })?.member?.trainingLog,
  progressSummaries: (member: Member) => graphql('ProgressSummaries', PROGRESS_SUMMARIES, { id: member.id }),
  trainingGoals: (member: Member) => graphql('TrainingGoals', TRAINING_GOALS, { id: member.id }),
  streak: (member: Member) => graphql('Streak', STREAK, { id: member.id }),
  setTrainingGoal: (input: SetTrainingGoalInput) => graphql('SetTrainingGoal', SET_TRAINING_GOAL, { input }),
};

// --- Billing (REST): a member's membership and ledger, as the member app's membership page reads them

export const billing = {
  /** The seeded members each have a monthly membership (seed.sh). */
  membership: (member: Member) => rest('GET', `${BILLING_URL}/v1/members/${member.id}/membership`, null, 'GET /v1/members/:memberId/membership', [200]),
  ledger: (member: Member) => rest('GET', `${BILLING_URL}/v1/members/${member.id}/ledger?limit=20`, null, 'GET /v1/members/:memberId/ledger', [200]),
};
