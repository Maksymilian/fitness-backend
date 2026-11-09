#!/usr/bin/env bash
# Injects and clears faults between a service and its PostgreSQL, Redis or RabbitMQ, through
# Toxiproxy's API (docs/architecture.md, section 16). Only a service started with
# scripts/faults/start-through-toxiproxy.sh goes through the proxies. Each change is also an
# annotation (tag `fault`) on the Grafana dashboards, when Grafana runs.
#
# Usage: scripts/faults/fault.sh <command>
#   list                          the proxies, and the faults on each
#   latency <proxy> <ms> [jitter] every answer from the dependency arrives <ms> later (± jitter)
#   hang <proxy>                  the dependency stops answering; connections stay open
#   down <proxy>                  connections are closed and refused (the proxy is off)
#   up <proxy>                    connections are accepted again (faults stay)
#   clear [<proxy>]               no faults on the proxy, and it's on; without a proxy, on all of them
#
# Proxies: workout-tracking-db, workout-tracking-rabbitmq, training-progress-db,
# training-progress-redis, training-progress-rabbitmq, billing-db, billing-rabbitmq.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOXIPROXY="http://localhost:8474"
GRAFANA="http://localhost:3000"

usage() {
  sed -n '7,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

api() {
  local method="$1" path="$2" body="${3:-}"
  curl -fsS -X "$method" -H 'Content-Type: application/json' ${body:+-d "$body"} "$TOXIPROXY$path"
}

require_proxy() {
  [[ -n "${1:-}" ]] || usage
  if ! curl -fsS -o /dev/null "$TOXIPROXY/proxies/$1"; then
    echo "No proxy $1 (or Toxiproxy isn't running: docker compose --profile faults up -d --wait)" >&2
    exit 1
  fi
}

# A toxic per kind of fault, named after it: adding one replaces the previous one.
replace_toxic() {
  local proxy="$1" name="$2" body="$3"
  curl -fsS -o /dev/null -X DELETE "$TOXIPROXY/proxies/$proxy/toxics/$name" 2>/dev/null || true
  api POST "/proxies/$proxy/toxics" "$body" > /dev/null
}

# A Grafana annotation for the change; skipped when Grafana isn't running.
annotate() {
  local text="$1" proxy="${2:-all}" password
  # Compose's own default when .env doesn't set it.
  password="$( (grep -E '^GRAFANA_ADMIN_PASSWORD=' "$ROOT_DIR/.env" 2>/dev/null || true) | tail -n 1 | cut -d= -f2-)"
  curl -fsS -o /dev/null -m 3 -u "admin:${password:-admin}" -H 'Content-Type: application/json' \
    -d "{\"text\": \"$text\", \"tags\": [\"fault\", \"$proxy\"]}" "$GRAFANA/api/annotations" 2>/dev/null ||
    echo "(no Grafana annotation: Grafana isn't running or refused the admin password)" >&2
}

command="${1:-}"
shift || true
case "$command" in
  list)
    api GET /proxies | node -e '
      const proxies = Object.values(JSON.parse(require("node:fs").readFileSync(0, "utf8")));
      for (const { name, listen, upstream, enabled, toxics } of proxies.sort((a, b) => a.name.localeCompare(b.name))) {
        const faults = toxics.map(({ name, attributes }) => `${name} ${JSON.stringify(attributes)}`).join(", ") || "none";
        console.log(`${name.padEnd(28)} ${listen.padEnd(8)} -> ${upstream.padEnd(26)} ${enabled ? "up  " : "DOWN"}  faults: ${faults}`);
      }'
    ;;
  latency)
    proxy="${1:-}" ms="${2:-}" jitter="${3:-0}"
    require_proxy "$proxy"
    [[ "$ms" =~ ^[0-9]+$ && "$jitter" =~ ^[0-9]+$ ]] || usage
    replace_toxic "$proxy" latency "{\"name\": \"latency\", \"type\": \"latency\", \"stream\": \"downstream\", \"attributes\": {\"latency\": $ms, \"jitter\": $jitter}}"
    echo "$proxy: answers $ms ms later (jitter $jitter ms)"
    annotate "$proxy: latency $ms ms (jitter $jitter ms)" "$proxy"
    ;;
  hang)
    proxy="${1:-}"
    require_proxy "$proxy"
    # Toxiproxy's timeout toxic with 0: no data gets through, and the connection is never closed.
    replace_toxic "$proxy" hang '{"name": "hang", "type": "timeout", "stream": "downstream", "attributes": {"timeout": 0}}'
    echo "$proxy: stops answering"
    annotate "$proxy: hangs (stops answering)" "$proxy"
    ;;
  down | up)
    proxy="${1:-}"
    require_proxy "$proxy"
    enabled="$([[ "$command" == up ]] && echo true || echo false)"
    api POST "/proxies/$proxy" "{\"enabled\": $enabled}" > /dev/null
    echo "$proxy: $command"
    annotate "$proxy: $command" "$proxy"
    ;;
  clear)
    proxy="${1:-}"
    if [[ -z "$proxy" ]]; then
      api POST /reset > /dev/null
      echo "All proxies: no faults, up"
      annotate "All faults cleared"
    else
      require_proxy "$proxy"
      for toxic in latency hang; do
        curl -fsS -o /dev/null -X DELETE "$TOXIPROXY/proxies/$proxy/toxics/$toxic" 2>/dev/null || true
      done
      api POST "/proxies/$proxy" '{"enabled": true}' > /dev/null
      echo "$proxy: no faults, up"
      annotate "$proxy: faults cleared" "$proxy"
    fi
    ;;
  *)
    usage
    ;;
esac
