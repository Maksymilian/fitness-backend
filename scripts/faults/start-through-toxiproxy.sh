#!/usr/bin/env bash
# Starts a service like `pnpm start:dev:<service>`, with its PostgreSQL, Redis and RabbitMQ
# connections through Toxiproxy (docs/architecture.md, section 16), so scripts/faults/fault.sh can
# slow them down or cut them. The URLs come from the service's .env; only their ports change to the
# proxies' (infrastructure/toxiproxy/proxies.json). The variables set here win over the .env file.
#
# Usage: scripts/faults/start-through-toxiproxy.sh workout-tracking|training-progress|billing
#   Needs Toxiproxy: docker compose --profile faults up -d --wait
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE="${1:-}"

# variable  local port  proxy port
case "$SERVICE" in
  workout-tracking) CONNECTIONS=("DATABASE_URL 5433 25433" "RABBITMQ_URL 5672 25672") ;;
  training-progress) CONNECTIONS=("DATABASE_URL 5434 25434" "REDIS_URL 6379 26379" "RABBITMQ_URL 5672 25673") ;;
  billing) CONNECTIONS=("DATABASE_URL 5435 25435" "RABBITMQ_URL 5672 25674") ;;
  *)
    echo "Usage: $0 workout-tracking|training-progress|billing" >&2
    exit 2
    ;;
esac

ENV_FILE="$ROOT_DIR/apps/$SERVICE/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "apps/$SERVICE/.env doesn't exist: copy apps/$SERVICE/.env.example first" >&2
  exit 1
fi
if ! curl -fsS -o /dev/null http://localhost:8474/version; then
  echo "Toxiproxy isn't running: docker compose --profile faults up -d --wait" >&2
  exit 1
fi

for connection in "${CONNECTIONS[@]}"; do
  read -r variable port proxy_port <<< "$connection"
  url="$(grep -E "^$variable=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
  # scheme://[user:password@]host:port[/...]: only the port after the host changes.
  through_proxy="$(sed -E "s#^([a-z]+://([^@/]*@)?[^:/@]+):$port([/?]|\$)#\1:$proxy_port\3#" <<< "$url")"
  if [[ "$through_proxy" == "$url" ]]; then
    echo "$variable in apps/$SERVICE/.env doesn't use port $port: $url" >&2
    exit 1
  fi
  export "$variable=$through_proxy"
  echo "$variable through Toxiproxy, port $proxy_port"
done

cd "$ROOT_DIR"
exec pnpm "start:dev:$SERVICE"
