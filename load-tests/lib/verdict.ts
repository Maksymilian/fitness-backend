// What a load test must not leave behind (docs/architecture.md, section 17.3), checked after the
// traffic, in teardown(): every workout recorded is logged in Training Progress exactly once, no
// dead letters, no message left in a queue, no failed trace, no error log, no alert. Each is a
// counter with a `count==0` threshold, so k6 fails the run (exit code 99) when one isn't zero.
// The traces, logs and alerts come from Grafana's API (Tempo, Loki, alert history), RabbitMQ's from
// its management API, the outbox's from the services' admin routes (ADMIN_TOKEN).
import { sleep } from 'k6';
import encoding from 'k6/encoding';
import http, { type RefinedResponse } from 'k6/http';
import { Counter } from 'k6/metrics';
import type { Threshold } from 'k6/options';
import { BILLING_URL, body, type GraphQLResponse, TRAINING_PROGRESS_URL, type TrainingLogPage, type Workout, type WorkoutPage, WORKOUT_TRACKING_URL } from './api.ts';
import type { Member } from './members.ts';

const GRAFANA_URL = __ENV.GRAFANA_URL || 'http://localhost:3000';
const GRAFANA_AUTH = __ENV.GRAFANA_AUTH || 'admin:admin';
const RABBITMQ_URL = __ENV.RABBITMQ_MANAGEMENT_URL || 'http://localhost:15672';
const RABBITMQ_AUTH = __ENV.RABBITMQ_AUTH || 'fitness:fitness';
/** The services' outbox admin routes. */
const OUTBOX_ADMIN = {
  'workout-tracking': `${WORKOUT_TRACKING_URL}/internal/v1/admin/outbox`,
  'training-progress': `${TRAINING_PROGRESS_URL}/internal/admin/outbox`,
  billing: `${BILLING_URL}/internal/admin/outbox`,
};
type Service = keyof typeof OUTBOX_ADMIN;
const ADMIN_TOKENS: Record<Service, string | undefined> = {
  'workout-tracking': __ENV.WORKOUT_TRACKING_ADMIN_TOKEN,
  'training-progress': __ENV.TRAINING_PROGRESS_ADMIN_TOKEN,
  billing: __ENV.BILLING_ADMIN_TOKEN,
};
const ALL_SERVICES = Object.keys(OUTBOX_ADMIN) as Service[];
const SERVICES = 'workout-tracking|training-progress|billing';
/** Billing's membership events, consumed by Training Progress for the goal allowances. */
const BILLING_QUEUE = 'training-progress.billing';
export const QUEUE = 'training-progress.workout-tracking';
const DEAD_LETTER_QUEUE = `${QUEUE}.dlq`;

/** How long the recorded workouts may take to reach Training Progress. */
const RECONCILE_TIMEOUT_S = Number(__ENV.RECONCILE_TIMEOUT_S || 120);
/** How long the last messages may take to be acknowledged, once the workouts reconciled. */
const DRAIN_TIMEOUT_S = Number(__ENV.DRAIN_TIMEOUT_S || 30);
/** Grafana evaluates the alert rules every minute: wait for one evaluation after the traffic. */
const ALERT_WAIT_S = Number(__ENV.ALERT_WAIT_S || 75);
/** The rules that count requests (over 20 a minute): a load test fires them on purpose. */
const TRAFFIC_ALERTS = ['NestJS endpoint over 20 requests per minute', 'GraphQL operation over 20 per minute'];

const counters = {
  lost: new Counter('lost_workouts'),
  duplicated: new Counter('duplicated_workouts'),
  deadLetters: new Counter('dead_letters'),
  messagesLeft: new Counter('messages_left'),
  errorTraces: new Counter('error_traces'),
  errorLogs: new Counter('error_logs'),
  alerts: new Counter('alerts_fired'),
  unavailable: new Counter('checks_unavailable'),
};

/** The verdict's thresholds, for a test's options. */
export const VERDICT_THRESHOLDS: Record<string, Threshold[]> = Object.fromEntries(
  ['lost_workouts', 'duplicated_workouts', 'dead_letters', 'messages_left', 'error_traces', 'error_logs', 'alerts_fired', 'checks_unavailable'].map(
    (name) => [name, ['count==0']],
  ),
);

/** The traffic's thresholds: p95 under `p95Ms` (overall, REST and GraphQL), no failed request, no 5xx, no GraphQL error. */
export function trafficThresholds(p95Ms: number): Record<string, Threshold[]> {
  return {
    'http_req_duration{phase:traffic}': [`p(95)<${p95Ms}`],
    'http_req_duration{phase:traffic,interface:rest}': [`p(95)<${p95Ms}`],
    'http_req_duration{phase:traffic,interface:graphql}': [`p(95)<${p95Ms}`],
    'http_req_failed{phase:traffic}': ['rate==0'],
    'checks{phase:traffic}': ['rate==1'],
    server_errors: ['count==0'],
    graphql_errors: ['count==0'],
  };
}

// --- The other APIs' shapes, the fields the verdict reads

/** A queue, from RabbitMQ's management API. */
interface Queue {
  messages: number;
  consumers: number;
}

/** The outbox relay's stats (OutboxRelay.stats()) and a dead letter, from the services' admin routes. */
interface OutboxStats {
  pending: number;
}
interface DeadLetter {
  failedAt: number;
}

interface TempoSearch {
  traces?: { traceID: string; rootServiceName: string; rootTraceName: string }[];
}

interface LokiQuery<R> {
  data: { result: R[] };
}

/** An alert's state change, from Grafana's annotations. */
interface AlertAnnotation {
  alertName: string;
  newState: string;
}

/** The alerts firing or pending now, from Grafana's Prometheus-style API. */
interface GrafanaAlerts {
  data: { alerts: { labels: { alertname: string }; state: string }[] };
}

const VERDICT_TAGS = { phase: 'verdict' };

function get(url: string, headers: Record<string, string> = {}) {
  return http.get(url, { headers, tags: { ...VERDICT_TAGS, name: 'verdict' }, responseCallback: http.expectedStatuses(200) });
}

const basic = (credentials: string) => ({ Authorization: `Basic ${encoding.b64encode(credentials)}` });

/** `fn()`'s result, or undefined after counting the check as unavailable. */
function attempt<T>(what: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    counters.unavailable.add(1, { check: what });
    console.error(`✗ ${what}: couldn't check (${(error as Error).message ?? error})`);
    return undefined;
  }
}

function json<T>(response: RefinedResponse<'text'>, what: string): T {
  if (response.status !== 200) {
    throw new Error(`${what} answered ${response.status || response.error}`);
  }
  return body<T>(response);
}

/** A queue on RabbitMQ's default vhost, from its management API: throws unless it answers 200. */
export function queue(name: string): Queue {
  return json(get(`${RABBITMQ_URL}/api/queues/%2F/${encodeURIComponent(name)}`, basic(RABBITMQ_AUTH)), `RabbitMQ's management API (${name})`);
}

/** `stats` (OutboxRelay.stats()) or `dead-letters` (newest first) of the service's outbox. */
function outbox(service: Service, route: 'stats'): OutboxStats;
function outbox(service: Service, route: 'dead-letters'): DeadLetter[];
function outbox(service: Service, route: string): unknown {
  const token = ADMIN_TOKENS[service];
  if (!token) {
    throw new Error(`no admin token for ${service} (ADMIN_TOKEN in its .env)`);
  }
  return json(get(`${OUTBOX_ADMIN[service]}/${route}`, { 'x-admin-token': token }), `${service}'s outbox ${route}`);
}

/**
 * Where the test starts: its time, and the dead letters RabbitMQ's DLQ already holds (the outboxes'
 * have a time, RabbitMQ's don't). `deadLetterQueue` can come from an earlier run (DLQ_BEFORE).
 */
export function snapshot(since = new Date(), deadLetterQueue?: number) {
  return {
    since: since.toISOString(),
    sinceMs: since.getTime(),
    deadLetterQueue: deadLetterQueue ?? attempt('the DLQ before the test', () => queue(DEAD_LETTER_QUEUE).messages),
  };
}

export type Snapshot = ReturnType<typeof snapshot>;

// --- Workouts: recorded in Workout Tracking, logged in Training Progress

/** The ids of the member's workouts recorded in this run (`runId` starts their recording ids), from Workout Tracking. */
function recordedWorkouts(member: Member, runId: string, since: string): Workout[] {
  const workouts: Workout[] = [];
  let cursor = '';
  for (;;) {
    const url = `${WORKOUT_TRACKING_URL}/internal/v1/members/${member.id}/workouts?limit=100&cursor=${encodeURIComponent(cursor)}`;
    const page = json<WorkoutPage>(get(url), "Workout Tracking's member workouts");
    for (const workout of page.workouts) {
      if (workout.startedAt < since) {
        return workouts; // newest first: the rest are older than the run
      }
      if (workout.recordingId.startsWith(`${runId}-`)) {
        workouts.push(workout);
      }
    }
    if (!page.nextCursor) {
      return workouts;
    }
    cursor = page.nextCursor;
  }
}

const TRAINING_LOG = `query Reconcile($id: ID!, $after: String) {
  member(id: $id) { trainingLog(first: 100, after: $after) { edges { node { id startedAt } } pageInfo { hasNextPage endCursor } } }
}`;

/** The ids in the member's training log started since `since`, with repetitions. */
function loggedWorkoutIds(member: Member, since: string): string[] {
  const ids: string[] = [];
  let after = '';
  for (;;) {
    const response = http.post(`${TRAINING_PROGRESS_URL}/graphql`, JSON.stringify({ query: TRAINING_LOG, variables: { id: member.id, after } }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { ...VERDICT_TAGS, name: 'verdict' },
    });
    const result = json<GraphQLResponse<{ member: { trainingLog: TrainingLogPage } }>>(response, "Training Progress' training log");
    if (result.errors) {
      throw new Error(`training log: ${JSON.stringify(result.errors[0])}`);
    }
    const { edges, pageInfo } = result.data!.member.trainingLog;
    for (const { node } of edges) {
      if (node.startedAt < since) {
        return ids;
      }
      ids.push(node.id);
    }
    if (!pageInfo.hasNextPage || pageInfo.endCursor === null) {
      return ids;
    }
    after = pageInfo.endCursor;
  }
}

/**
 * Every workout recorded in this run for `members` is in their training log, once: waits up to
 * RECONCILE_TIMEOUT_S for the integration events. Lost: recorded, never logged. Duplicated: a
 * recording that made two workouts, or a workout logged twice.
 */
export function reconcile(members: Member[], runId: string, since: string): number {
  const recorded = members.map((member) => ({ member, workouts: recordedWorkouts(member, runId, since) }));
  const total = recorded.reduce((sum, { workouts }) => sum + workouts.length, 0);
  let duplicated = 0;
  for (const { workouts } of recorded) {
    duplicated += workouts.length - new Set(workouts.map((workout) => `${workout.equipmentId} ${workout.recordingId}`)).size;
  }
  const startedAt = Date.now();
  let missing: string[] = [];
  let loggedTwice = 0;
  do {
    missing = [];
    loggedTwice = 0;
    for (const { member, workouts } of recorded) {
      const logged = loggedWorkoutIds(member, since);
      loggedTwice += logged.length - new Set(logged).size;
      const loggedSet = new Set(logged);
      missing.push(...workouts.filter((workout) => !loggedSet.has(workout.id)).map((workout) => `${member.id} ${workout.id}`));
    }
    if (missing.length === 0) {
      break;
    }
    sleep(5);
  } while (Date.now() - startedAt < RECONCILE_TIMEOUT_S * 1000);

  counters.lost.add(missing.length);
  counters.duplicated.add(duplicated + loggedTwice);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  if (missing.length === 0) {
    console.log(`✓ workouts: all ${total} recorded for ${members.length} members are in their training logs (waited ${seconds} s)`);
  } else {
    console.error(`✗ workouts: ${missing.length} of ${total} recorded never reached the training log within ${RECONCILE_TIMEOUT_S} s, e.g. ${missing.slice(0, 3).join(', ')}`);
  }
  if (duplicated + loggedTwice > 0) {
    console.error(`✗ workouts: ${duplicated} recordings made two workouts, ${loggedTwice} workouts are logged twice`);
  }
  return total;
}

// --- Messages: dead letters, and what is left in a queue or an outbox

/** New dead letters: in the services' outboxes (failed since the start), and in RabbitMQ's DLQ. */
function deadLetters(start: Snapshot, services: readonly Service[]): void {
  const added: Record<string, number> = {};
  for (const service of services) {
    attempt(`${service}'s dead letters`, () => {
      added[`${service}'s outbox`] = outbox(service, 'dead-letters').filter((deadLetter) => deadLetter.failedAt >= start.sinceMs).length;
    });
  }
  const before = start.deadLetterQueue;
  if (before === undefined) {
    counters.unavailable.add(1, { check: 'the DLQ' });
    console.error("✗ dead letters: couldn't count the DLQ's before the test");
  } else {
    attempt('the DLQ', () => {
      added[DEAD_LETTER_QUEUE] = Math.max(0, queue(DEAD_LETTER_QUEUE).messages - before);
    });
  }
  const count = Object.values(added).reduce((sum, n) => sum + n, 0);
  counters.deadLetters.add(count);
  if (count === 0) {
    console.log(`✓ dead letters: none new (${Object.keys(added).join(', ')})`);
  } else {
    console.error(`✗ dead letters: ${Object.entries(added).filter(([, n]) => n > 0).map(([where, n]) => `${n} new in ${where}`).join(', ')}`);
  }
}

/** Nothing left to deliver: waits up to DRAIN_TIMEOUT_S for the last messages in flight to be acknowledged. */
function messagesLeft(): void {
  attempt('messages left', () => {
    const deadline = Date.now() + DRAIN_TIMEOUT_S * 1000;
    let left: Record<string, number>;
    for (;;) {
      left = {
        [QUEUE]: queue(QUEUE).messages,
        [BILLING_QUEUE]: queue(BILLING_QUEUE).messages,
        'workout-tracking outbox': outbox('workout-tracking', 'stats').pending,
        'training-progress outbox': outbox('training-progress', 'stats').pending,
        'billing outbox': outbox('billing', 'stats').pending,
      };
      if (Object.values(left).every((n) => n === 0) || Date.now() > deadline) {
        break;
      }
      sleep(2);
    }
    const count = Object.values(left).reduce((sum, n) => sum + n, 0);
    counters.messagesLeft.add(count);
    if (count === 0) {
      console.log(`✓ messages: none left in ${QUEUE}, ${BILLING_QUEUE} or the outboxes`);
    } else {
      console.error(`✗ messages left after ${DRAIN_TIMEOUT_S} s: ${JSON.stringify(left)}`);
    }
  });
}

// --- Telemetry: failed traces, error logs, alerts (Grafana's API)

function grafana<T>(path: string): T {
  return json<T>(get(`${GRAFANA_URL}${path}`, basic(GRAFANA_AUTH)), `Grafana (${path.split('?')[0]})`);
}

function errorTraces(fromMs: number, toMs: number): void {
  attempt('failed traces', () => {
    const q = `{ resource.service.name =~ "${SERVICES}" && status = error }`;
    const search = grafana<TempoSearch>(
      `/api/datasources/proxy/uid/tempo/api/search?q=${encodeURIComponent(q)}&start=${Math.floor(fromMs / 1000)}&end=${Math.ceil(toMs / 1000)}&limit=100`,
    );
    const traces = search.traces ?? [];
    counters.errorTraces.add(traces.length);
    if (traces.length === 0) {
      console.log('✓ traces: none failed (Tempo)');
    } else {
      const examples = traces.slice(0, 5).map((trace) => `${trace.traceID} (${trace.rootServiceName} ${trace.rootTraceName})`);
      console.error(`✗ traces: ${traces.length}${traces.length === 100 ? '+' : ''} with a failed span, in Tempo: ${q}; e.g. ${examples.join(', ')}`);
    }
  });
}

function errorLogs(fromMs: number, toMs: number): void {
  attempt('error logs', () => {
    const seconds = Math.ceil((toMs - fromMs) / 1000);
    const selector = `{service_name=~"${SERVICES}"} | detected_level=~"(?i)error|fatal"`;
    const query = `sum by (service_name) (count_over_time(${selector} [${seconds}s]))`;
    const result = grafana<LokiQuery<{ value: [number, string] }>>(
      `/api/datasources/proxy/uid/loki/loki/api/v1/query?query=${encodeURIComponent(query)}&time=${toMs * 1e6}`,
    ).data.result;
    const count = result.reduce((sum, series) => sum + Number(series.value[1]), 0);
    counters.errorLogs.add(count);
    if (count === 0) {
      console.log('✓ logs: no error (Loki)');
    } else {
      const lines = grafana<LokiQuery<{ stream: { service_name: string }; values: [string, string][] }>>(
        `/api/datasources/proxy/uid/loki/loki/api/v1/query_range?query=${encodeURIComponent(selector)}&start=${fromMs * 1e6}&end=${toMs * 1e6}&limit=3`,
      ).data.result.flatMap((stream) => stream.values.map(([, line]) => `${stream.stream.service_name}: ${line.slice(0, 200)}`));
      console.error(`✗ logs: ${count} errors, in Loki: ${selector}; e.g.\n  ${lines.join('\n  ')}`);
    }
  });
}

/**
 * `during`: any rule that fired in the window. `after`: any firing now. Pending (the condition
 * held, but not yet for the rule's `for`) is shown, not counted: under steady writes, the queue rules
 * see messages in flight at a scrape.
 */
function alerts(fromMs: number, toMs: number, when: AlertsWhen): void {
  attempt('alerts', () => {
    const states =
      when === 'during'
        ? grafana<AlertAnnotation[]>(`/api/annotations?type=alert&from=${fromMs}&to=${toMs}&limit=1000`).map((a) => ({ name: a.alertName, state: a.newState }))
        : grafana<GrafanaAlerts>('/api/prometheus/grafana/api/v1/alerts').data.alerts.map((a) => ({ name: a.labels.alertname, state: a.state }));
    const relevant = states.filter(({ name }) => !TRAFFIC_ALERTS.includes(name));
    const fired = [...new Set(relevant.filter(({ state }) => /^Alerting/i.test(state)).map(({ name }) => name))];
    const pending = [...new Set(relevant.filter(({ state }) => /^Pending/i.test(state)).map(({ name }) => name))].filter((name) => !fired.includes(name));
    counters.alerts.add(fired.length);
    const verb = when === 'during' ? 'fired' : 'firing';
    if (fired.length === 0) {
      console.log(`✓ alerts: none ${verb} (not counting the request-rate rules, which count traffic)`);
    } else {
      console.error(`✗ alerts ${verb}: ${fired.join('; ')}`);
    }
    if (pending.length > 0) {
      console.log(`  pending, not fired: ${pending.join('; ')}`);
    }
  });
}

/** `during` (load tests: nothing may fire while they run) or `after` (a migration: nothing may still fire once it's over). */
type AlertsWhen = 'during' | 'after';

/** The whole verdict, in teardown(). `members`: whose recordings to reconcile. */
export function judge(start: Snapshot, { members, runId, alertsWhen = 'during' }: { members: Member[]; runId: string; alertsWhen?: AlertsWhen }): void {
  const trafficEndedMs = Date.now();
  console.log(`Verdict of run ${runId}, since ${start.since}:`);
  attempt('workouts', () => reconcile(members, runId, start.since));
  deadLetters(start, ALL_SERVICES);
  messagesLeft();
  const waitS = Math.ceil((trafficEndedMs + ALERT_WAIT_S * 1000 - Date.now()) / 1000);
  if (waitS > 0) {
    console.log(`  (waiting ${waitS} s for an alert evaluation, and for the last traces and logs)`);
    sleep(waitS);
  }
  const toMs = Date.now();
  errorTraces(start.sinceMs, toMs);
  errorLogs(start.sinceMs, toMs);
  alerts(alertsWhen === 'during' ? start.sinceMs : toMs - 60_000, toMs, alertsWhen);
}

/**
 * The backlog's verdict: the recorded workouts' events wait in the queue, since nothing consumes
 * them (Training Progress is stopped). Then move them, and run load-tests/k6.sh reconcile.
 */
export function judgeBacklog(start: Snapshot, { members, runId }: { members: Member[]; runId: string }): void {
  console.log(`Backlog of run ${runId}, since ${start.since}:`);
  const recorded = attempt('workouts', () => members.reduce((sum, member) => sum + recordedWorkouts(member, runId, start.since).length, 0));
  attempt('the backlog', () => {
    const deadline = Date.now() + RECONCILE_TIMEOUT_S * 1000;
    while (outbox('workout-tracking', 'stats').pending > 0 && Date.now() < deadline) {
      sleep(2); // Workout Tracking's relay is still publishing
    }
    const { messages, consumers } = queue(QUEUE);
    const missing = Math.max(0, (recorded ?? 0) - messages);
    counters.lost.add(missing);
    const line = `${messages} messages wait in ${QUEUE} (${consumers} consumers) for the ${recorded} workouts recorded`;
    (missing === 0 ? console.log : console.error)(`${missing === 0 ? '✓' : '✗'} ${line}`);
  });
  deadLetters(start, ['workout-tracking']);
  console.log(
    `Next: move them (docs/architecture.md, section 17.4), start Training Progress, then\n` +
      `  load-tests/k6.sh reconcile -e RUN_ID=${runId} -e SINCE=${start.since} -e DLQ_BEFORE=${start.deadLetterQueue ?? 0}`,
  );
}

/** The run's id, which starts its recording ids: k6.sh's TEST_ID (`stress-20261016T184500Z`, also k6's `testid` tag), else `run-<time>`. */
export const newRunId = (): string => __ENV.TEST_ID || `run-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
