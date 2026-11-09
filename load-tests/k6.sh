#!/usr/bin/env bash
# Runs a load test (docs/architecture.md, section 17) with k6, Compose's `k6` service (profile
# `load-tests`, nothing to install), against the services running on this machine, then checks the
# verdict: p95, errors, the events reconciled, dead letters, queues, failed traces, error logs and
# alerts. Exits with k6's code: 0 when every threshold passed, 99 when one failed. k6's metrics go to
# Prometheus through Alloy, tagged `testid=<test>-<UTC time>`: Grafana's k6 Prometheus dashboard.
#
# Usage: load-tests/k6.sh <test> [k6 run options, e.g. -e PEAK_RATE=150 -e P95_MS=80]
#   smoke             2 VUs for 30 s: run it first
#   stress            the usual traffic (90% reads), rising to PEAK_RATE and held; p95 under 100 ms
#   spike             the usual traffic, then SPIKE_RATE within 10 s; p95 under 200 ms
#   streak-stampede   a spike on the hot members' streaks, while they record workouts; p95 under 200 ms
#   backlog           with Training Progress stopped: recordings whose events wait in its queue
#   reconcile         after the backlog was moved and consumed: -e RUN_ID=... -e SINCE=... -e DLQ_BEFORE=...
#
# Needs: the three services (pnpm start:dev:<service>), the members (load-tests/seed.sh), and the
# observability profile. The admin tokens come from the services' .env, Grafana's password from .env.
# Each run is an annotation on the Fitness platform dashboard (tag `load-test`), and its reports
# (web dashboard, metrics, summary, console output) go to var/load-tests/<test id>/.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRAFANA="http://localhost:3000"
TEST="${1:-}"

# The test's script, in TypeScript: k6 strips the types.
SCRIPT="$TEST.ts"

if [[ -z "$TEST" || ! -f "$ROOT_DIR/load-tests/$SCRIPT" ]]; then
  sed -n '7,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
fi
shift

# A variable's last value in a .env file, or nothing.
env_value() {
  (grep -E "^$2=" "$ROOT_DIR/$1" 2>/dev/null || true) | tail -n 1 | cut -d= -f2-
}

export WORKOUT_TRACKING_ADMIN_TOKEN TRAINING_PROGRESS_ADMIN_TOKEN BILLING_ADMIN_TOKEN GRAFANA_AUTH RABBITMQ_AUTH
WORKOUT_TRACKING_ADMIN_TOKEN="$(env_value apps/workout-tracking/.env ADMIN_TOKEN)"
TRAINING_PROGRESS_ADMIN_TOKEN="$(env_value apps/training-progress/.env ADMIN_TOKEN)"
BILLING_ADMIN_TOKEN="$(env_value apps/billing/.env ADMIN_TOKEN)"
GRAFANA_PASSWORD="$(env_value .env GRAFANA_ADMIN_PASSWORD)"
GRAFANA_AUTH="admin:${GRAFANA_PASSWORD:-admin}" # Compose's own default when .env doesn't set it
# amqp://user:password@host:port: the management API takes the same user.
RABBITMQ_AUTH="$(env_value apps/workout-tracking/.env RABBITMQ_URL | sed -nE 's#^amqps?://([^@/]+)@.*#\1#p')"
[[ "$RABBITMQ_AUTH" == *:* ]] || RABBITMQ_AUTH="fitness:fitness"

# The cache mode Training Progress was started with: the shell's, as for the service, else its .env's.
READ_CACHE="${READ_CACHE:-$(env_value apps/training-progress/.env READ_CACHE)}"
READ_CACHE_LOCK="${READ_CACHE_LOCK:-$(env_value apps/training-progress/.env READ_CACHE_LOCK)}"
# The run's id: k6's `testid` tag (the k6 dashboard's Test ID), the verdict's run, and its recordings' prefix.
export TEST_ID
TEST_ID="$TEST-$(date -u +%Y%m%dT%H%M%SZ)"
DESCRIPTION="$TEST_ID"
if [[ "$TEST" == streak-stampede ]]; then
  DESCRIPTION="$TEST_ID (READ_CACHE=${READ_CACHE:-on}, READ_CACHE_LOCK=${READ_CACHE_LOCK:-on})"
  # Midnight UTC: every streak expires at once.
  docker compose -f "$ROOT_DIR/compose.yaml" exec -T redis sh -c "redis-cli --scan --pattern '*streak:load-*' | xargs -r redis-cli unlink > /dev/null"
  echo "Forgot the load test members' cached streaks."
fi

# The run as a region annotation on the dashboards; skipped when Grafana isn't running.
annotation_id="$(curl -fsS -m 3 -u "$GRAFANA_AUTH" -H 'Content-Type: application/json' \
  -d "{\"text\": \"Load test: $DESCRIPTION\", \"tags\": [\"load-test\", \"$TEST\"]}" "$GRAFANA/api/annotations" 2>/dev/null |
  sed -nE 's/.*"id": *([0-9]+).*/\1/p' || true)"
[[ -n "$annotation_id" ]] || echo "(no Grafana annotation: Grafana isn't running or refused the admin password)" >&2

finish() {
  local code=$?
  if [[ -n "$annotation_id" ]]; then
    local result="passed"
    [[ $code -eq 0 ]] || result="failed (exit $code)"
    curl -fsS -o /dev/null -m 3 -u "$GRAFANA_AUTH" -X PATCH -H 'Content-Type: application/json' \
      -d "{\"timeEnd\": $(date +%s%3N), \"text\": \"Load test: $DESCRIPTION, $result\"}" "$GRAFANA/api/annotations/$annotation_id" || true
  fi
}
trap finish EXIT

# The run's reports, in var/load-tests/<test id>/ (/results/<test id>/ in the container):
#   dashboard.html   k6's web dashboard, saved when the run ends (k6 skips it for a run shorter than a
#                    few of its 10-second periods); K6_WEB_DASHBOARD=false in the shell turns it off
#   metrics.json     every data point, one JSON object a line (k6's json output)
#   summary.json     the end-of-test summary: each metric's statistics and each threshold's result
#   console.log      what the run printed: progress, the verdict and the thresholds
# Created as this user before the run: Docker would create a missing directory as root.
REPORTS="var/load-tests/$TEST_ID"
mkdir -p "$ROOT_DIR/$REPORTS"
export K6_WEB_DASHBOARD K6_WEB_DASHBOARD_EXPORT
K6_WEB_DASHBOARD="${K6_WEB_DASHBOARD:-true}"
K6_WEB_DASHBOARD_EXPORT="/results/$TEST_ID/dashboard.html"

echo "k6: $DESCRIPTION; reports in $REPORTS/; Grafana: k6 Prometheus, Test ID $TEST_ID" | tee "$ROOT_DIR/$REPORTS/console.log"

# Compose's k6 service, on the Compose network (compose.yaml has its URLs and its metrics' output).
# As this user, to write the reports; the variables without a value pass on the ones exported above,
# out of sight of `ps`. pipefail keeps k6's exit code through tee.
docker compose -f "$ROOT_DIR/compose.yaml" --profile load-tests run --rm --user "$(id -u):$(id -g)" \
  -e TEST_ID -e WORKOUT_TRACKING_ADMIN_TOKEN -e TRAINING_PROGRESS_ADMIN_TOKEN -e BILLING_ADMIN_TOKEN -e GRAFANA_AUTH -e RABBITMQ_AUTH \
  -e LOAD_MEMBERS -e LOAD_HOT_MEMBERS -e LOAD_WRITERS -e K6_WEB_DASHBOARD -e K6_WEB_DASHBOARD_EXPORT \
  k6 run --out experimental-prometheus-rw --out "json=/results/$TEST_ID/metrics.json" --tag "testid=$TEST_ID" \
  --summary-export "/results/$TEST_ID/summary.json" "/load-tests/$SCRIPT" "$@" 2>&1 | tee -a "$ROOT_DIR/$REPORTS/console.log"
