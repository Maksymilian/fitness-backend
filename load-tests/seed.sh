#!/usr/bin/env bash
# Seeds the load test members into the local databases (docs/architecture.md, section 17.1): each
# with a paired piece of equipment in Workout Tracking and a history of workouts, recorded in
# Workout Tracking and logged in Training Progress with the same ids, as if their events had
# already been delivered; and a membership in Billing, with a year of payments, and the goal
# allowance it gives in Training Progress. Local only, and not a Liquibase changeset: volume for load tests and
# query plans, not test records.
#
#   load-NNNN@example.com    a workout every day for the last --days days, up to yesterday (UTC);
#                            equipment n % 3: a bike, a treadmill or a rower
#   the first --hot members  two workouts a day for --hot-days days: a long streak to compute
#
# The ids are md5 of a name, written as a UUID (load-tests/lib/members.ts computes the same), and
# the inserts skip rows that exist: running it again changes nothing. --remove deletes the members'
# rows, the ones the load tests recorded included, and their cached read models.
#
# Usage: load-tests/seed.sh [--members 1000] [--days 365] [--hot 20] [--hot-days 1500] [--remove]
#   About 420,000 workouts per database with the defaults (15 seconds); the load tests need the
#   same --members and --hot (LOAD_MEMBERS, LOAD_HOT_MEMBERS).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEMBERS=1000
DAYS=365
HOT=20
HOT_DAYS=1500
REMOVE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --members) MEMBERS="$2"; shift 2 ;;
    --days) DAYS="$2"; shift 2 ;;
    --hot) HOT="$2"; shift 2 ;;
    --hot-days) HOT_DAYS="$2"; shift 2 ;;
    --remove) REMOVE=true; shift ;;
    *) sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
  esac
done
for number in "$MEMBERS" "$DAYS" "$HOT" "$HOT_DAYS"; do
  [[ "$number" =~ ^[0-9]+$ ]] || { echo "Not a number: $number" >&2; exit 2; }
done
(( MEMBERS <= 9999 )) || { echo "At most 9999 members: their ids have four digits" >&2; exit 2; }

cd "$ROOT_DIR"

# psql in a database's container, with the numbers as psql variables.
psql_in() {
  local service="$1" database="$2"
  docker compose exec -T "$service" psql -U "$database" -d "$database" -v ON_ERROR_STOP=1 -q \
    -v members="$MEMBERS" -v days="$DAYS" -v hot="$HOT" -v hot_days="$HOT_DAYS"
}

# The members' workouts, the same in both databases: one row per (member, day, session).
WORKOUTS_SQL="
WITH members AS (
  SELECT n, format('load-%s@example.com', lpad(n::text, 4, '0')) AS member_id, n <= :hot AS hot,
    (ARRAY['BIKE', 'TREADMILL', 'ROWER'])[n % 3 + 1] AS equipment_type
  FROM generate_series(1, :members) AS n
), sessions AS (
  SELECT m.*, d, k
  FROM members m
  CROSS JOIN LATERAL generate_series(1, CASE WHEN m.hot THEN :hot_days ELSE :days END) AS d
  CROSS JOIN LATERAL generate_series(1, CASE WHEN m.hot THEN 2 ELSE 1 END) AS k
), workouts AS (
  SELECT member_id, equipment_type,
    overlay(overlay(md5(format('load-workout-%s-%s-%s', n, d, k)) PLACING '7' FROM 13 FOR 1) PLACING '8' FROM 17 FOR 1)::uuid AS id,
    overlay(overlay(md5(format('load-equipment-%s', n)) PLACING '7' FROM 13 FOR 1) PLACING '8' FROM 17 FOR 1)::uuid AS equipment_id,
    format('load-%s-%s-%s', n, d, k) AS recording_id,
    CASE equipment_type WHEN 'BIKE' THEN 'CYCLING' WHEN 'ROWER' THEN 'ROWING' ELSE (ARRAY['RUNNING', 'WALKING'])[d % 2 + 1] END AS discipline,
    date_trunc('day', now(), 'UTC') - make_interval(days => d) + make_interval(hours => 1 + 6 * k + n % 5, mins => (n * 7 + d) % 60) AS started_at,
    1200 + (n * 37 + d * 11 + k * 5) % 4800 AS duration_seconds
  FROM sessions
), measured AS (
  SELECT *,
    round(duration_seconds * CASE discipline WHEN 'CYCLING' THEN 7.5 WHEN 'RUNNING' THEN 2.9 WHEN 'WALKING' THEN 1.4 ELSE 3.4 END)::int AS distance_meters,
    duration_seconds / 6 AS calories
  FROM workouts
)"

if [[ "$REMOVE" == true ]]; then
  psql_in workout-tracking-db workout_tracking <<'SQL'
DELETE FROM workout_corrections WHERE workout_id IN (SELECT id FROM workouts WHERE member_id LIKE 'load-%@example.com');
DELETE FROM workouts WHERE member_id LIKE 'load-%@example.com';
DELETE FROM equipment WHERE serial_number LIKE 'LOAD-%';
SQL
  psql_in training-progress-db training_progress <<'SQL'
DELETE FROM logged_workouts WHERE member_id LIKE 'load-%@example.com';
DELETE FROM personal_records WHERE member_id LIKE 'load-%@example.com';
DELETE FROM training_goals WHERE member_id LIKE 'load-%@example.com';
DELETE FROM goal_allowances WHERE member_id LIKE 'load-%@example.com';
SQL
  psql_in billing-db billing <<'SQL'
DELETE FROM ledger_entries WHERE member_id LIKE 'load-%@example.com';
DELETE FROM provider_customers WHERE member_id LIKE 'load-%@example.com';
DELETE FROM memberships WHERE member_id LIKE 'load-%@example.com';
SQL
  docker compose exec -T redis sh -c "redis-cli --scan --pattern '*load-*@example.com*' | xargs -r redis-cli unlink > /dev/null"
  echo "Removed the load test members, their workouts, records and goals, and their cached read models."
  exit 0
fi

echo "Workout Tracking: $MEMBERS members' equipment and workouts..."
psql_in workout-tracking-db workout_tracking <<SQL
INSERT INTO equipment (id, serial_number, type, paired_member_id, paired_at, registered_at, version)
SELECT overlay(overlay(md5(format('load-equipment-%s', n)) PLACING '7' FROM 13 FOR 1) PLACING '8' FROM 17 FOR 1)::uuid,
  format('LOAD-%s', lpad(n::text, 4, '0')), (ARRAY['BIKE', 'TREADMILL', 'ROWER'])[n % 3 + 1],
  format('load-%s@example.com', lpad(n::text, 4, '0')), now() - interval '10 years', now() - interval '10 years', 2
FROM generate_series(1, :members) AS n
ON CONFLICT DO NOTHING;
$WORKOUTS_SQL
INSERT INTO workouts (id, equipment_id, equipment_type, recording_id, member_id, discipline, started_at, duration_seconds,
  distance_meters, calories, status, revision, recorded_at)
SELECT id, equipment_id, equipment_type, recording_id, member_id, discipline, started_at, duration_seconds,
  distance_meters, calories, 'RECORDED', 1, started_at + make_interval(secs => duration_seconds)
FROM measured
ON CONFLICT DO NOTHING;
ANALYZE equipment, workouts;
SELECT format('  %s workouts of load test members', count(*)) FROM workouts WHERE member_id LIKE 'load-%@example.com' \gset
\echo :format
SQL

echo "Training Progress: their training logs..."
psql_in training-progress-db training_progress <<SQL
$WORKOUTS_SQL
INSERT INTO logged_workouts (id, member_id, discipline, started_at, duration_seconds, distance_meters, calories, counts,
  source_revision, logged_at)
SELECT id, member_id, discipline, started_at, duration_seconds, distance_meters, calories, true, 1,
  started_at + make_interval(secs => duration_seconds)
FROM measured
ON CONFLICT DO NOTHING;
ANALYZE logged_workouts;
SELECT format('  %s logged workouts of load test members', count(*)) FROM logged_workouts WHERE member_id LIKE 'load-%@example.com' \gset
\echo :format
SQL

echo "Billing: their memberships and ledgers; Training Progress: their goal allowances..."
# Every member has an active monthly membership, paid once a month for a year, as if Stripe's events
# had been applied: so the load tests' goals never hit the goal allowance of one active goal.
psql_in billing-db billing <<SQL
INSERT INTO memberships (id, member_id, plan, status, paid_through, renews, provider_reference, started_at, revision)
SELECT overlay(overlay(md5(format('load-membership-%s', n)) PLACING '7' FROM 13 FOR 1) PLACING '8' FROM 17 FOR 1)::uuid,
  format('load-%s@example.com', lpad(n::text, 4, '0')), 'MONTHLY', 'ACTIVE', now() + interval '10 years', true,
  format('sub_load_%s', n), now() - interval '1 year', 13
FROM generate_series(1, :members) AS n
ON CONFLICT DO NOTHING;
INSERT INTO ledger_entries (id, member_id, kind, amount, currency, occurred_at, provider_reference, plan, paid_through, membership_reference, recorded_at)
SELECT overlay(overlay(md5(format('load-payment-%s-%s', n, m)) PLACING '7' FROM 13 FOR 1) PLACING '8' FROM 17 FOR 1)::uuid,
  format('load-%s@example.com', lpad(n::text, 4, '0')), 'PAYMENT', 9.99, 'EUR', now() - make_interval(months => m),
  format('in_load_%s_%s', n, m), 'MONTHLY', now() - make_interval(months => m - 1), format('sub_load_%s', n), now() - make_interval(months => m)
FROM generate_series(1, :members) AS n CROSS JOIN generate_series(1, 12) AS m
ON CONFLICT DO NOTHING;
ANALYZE memberships, ledger_entries;
SQL
psql_in training-progress-db training_progress <<SQL
INSERT INTO goal_allowances (member_id, unlimited, source_revision, changed_at, version)
SELECT format('load-%s@example.com', lpad(n::text, 4, '0')), true, 13, now(), 1
FROM generate_series(1, :members) AS n
ON CONFLICT DO NOTHING;
SQL

# Read models cached before this seed would hide its rows until they expire.
docker compose exec -T redis sh -c "redis-cli --scan --pattern '*load-*@example.com*' | xargs -r redis-cli unlink > /dev/null"
echo "Done: LOAD_MEMBERS=$MEMBERS LOAD_HOT_MEMBERS=$HOT for the load tests (load-tests/k6.sh passes them on)."
