# shellcheck shell=bash
# Shared by the scripts in this folder, which source it: the connection to one service's database,
# and running Liquibase Open Source in Docker (its official image, so nothing to install) with that
# service's changelog. The container uses the host's network (Linux; Docker Desktop
# needs host networking turned on), so `localhost` in a URL is this machine.

LIQUIBASE_IMAGE="liquibase/liquibase:4.33"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

die() {
  echo "$(basename "$0"): $*" >&2
  exit 1
}

# Reads the service (the first argument) and the connection options; the other arguments are left
# in ARGS. Without --url, the target is the service's local Docker Compose database.
parse_connection() {
  SERVICE="${1:-}"
  case "$SERVICE" in
    workout-tracking) local port=5433 ;;
    training-progress) local port=5434 ;;
    billing) local port=5435 ;;
    *) die "the first argument is the service: workout-tracking, training-progress or billing" ;;
  esac
  shift
  LOCAL_DATABASE="${SERVICE//-/_}"
  LOCAL_URL="jdbc:postgresql://localhost:$port/$LOCAL_DATABASE"
  URL="$LOCAL_URL"
  USERNAME="$LOCAL_DATABASE"
  ARGS=()
  while (($# > 0)); do
    case "$1" in
      --url) URL="${2:?--url needs a value}"; shift 2 ;;
      --url=*) URL="${1#*=}"; shift ;;
      --username) USERNAME="${2:?--username needs a value}"; shift 2 ;;
      --username=*) USERNAME="${1#*=}"; shift ;;
      *) ARGS+=("$1"); shift ;;
    esac
  done
}

# Questions go to the terminal, even when the input is redirected. Without one (e.g. in CI), stops
# with what to do instead.
require_terminal() {
  (: </dev/tty) 2>/dev/null || die "$1"
}

# The password comes from LIQUIBASE_COMMAND_PASSWORD, is Docker Compose's for the local database,
# or is asked for once. It reaches the container through the environment, never the command line.
resolve_password() {
  if [[ -z "${LIQUIBASE_COMMAND_PASSWORD:-}" ]]; then
    if [[ "$URL" == "$LOCAL_URL" ]]; then
      LIQUIBASE_COMMAND_PASSWORD="$LOCAL_DATABASE"
    else
      require_terminal "no password: set LIQUIBASE_COMMAND_PASSWORD"
      read -rsp "Password for $USERNAME at $URL: " LIQUIBASE_COMMAND_PASSWORD </dev/tty
      echo >&2
    fi
  fi
  export LIQUIBASE_COMMAND_PASSWORD
}

# Runs a Liquibase command with its options. Test records (`context:test-data`) only ever go to the
# local database: anywhere else, the context filter leaves them out.
run_liquibase() {
  local contexts=none dirty=""
  [[ "$URL" == "$LOCAL_URL" ]] && contexts=test-data
  [[ -z "$(git -C "$ROOT_DIR" status --porcelain -- "apps/$SERVICE/liquibase")" ]] || dirty=", with uncommitted changes"
  echo "Liquibase $1 on $URL as $USERNAME, changelog apps/$SERVICE/liquibase at $(git -C "$ROOT_DIR" rev-parse --short HEAD)$dirty" >&2
  docker run --rm --network host \
    -v "$ROOT_DIR/apps/$SERVICE/liquibase:/liquibase/changelog:ro" \
    -e LIQUIBASE_SEARCH_PATH=/liquibase/changelog \
    -e LIQUIBASE_COMMAND_CHANGELOG_FILE=changelog.yaml \
    -e LIQUIBASE_COMMAND_URL="$URL" \
    -e LIQUIBASE_COMMAND_USERNAME="$USERNAME" \
    -e LIQUIBASE_COMMAND_PASSWORD \
    -e LIQUIBASE_COMMAND_CONTEXT_FILTER="$contexts" \
    -e LIQUIBASE_SHOW_BANNER=false \
    -e LIQUIBASE_ANALYTICS_ENABLED=false \
    "$LIQUIBASE_IMAGE" "$@"
}
