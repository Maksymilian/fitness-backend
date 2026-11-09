#!/usr/bin/env bash
# Creates the Basic Auth credentials the services send their telemetry with (docs/architecture.md,
# section 15): a random password, its bcrypt hash in infrastructure/alloy/htpasswd (Grafana Alloy
# rejects anything else), and the matching OTEL_EXPORTER_OTLP_HEADERS line in each service's .env.
# Both files are gitignored. Run it again to rotate the password, then restart Alloy and the services.
#
# Usage: scripts/observability/telemetry-credentials.sh [username]   (default: services)
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
USERNAME="${1:-services}"
PASSWORD="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("base64url"))')"

# bcrypt, from Apache's htpasswd; the password goes through stdin, never the command line.
HTPASSWD="$ROOT_DIR/infrastructure/alloy/htpasswd"
printf '%s' "$PASSWORD" | docker run --rm -i httpd:2.4-alpine htpasswd -niB "$USERNAME" | sed '/^$/d' > "$HTPASSWD"
chmod 644 "$HTPASSWD"
echo "Wrote $HTPASSWD for user $USERNAME"

# OTEL_EXPORTER_OTLP_HEADERS is a list of key=value with URL-encoded values: "Basic <base64>".
TOKEN="$(printf '%s:%s' "$USERNAME" "$PASSWORD" | base64 | tr -d '\n' | sed 's/=/%3D/g')"
LINE="OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20$TOKEN"
for service in workout-tracking training-progress billing; do
  env_file="$ROOT_DIR/apps/$service/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "Skipped apps/$service/.env: it doesn't exist (copy .env.example first)" >&2
    continue
  fi
  if grep -q '^OTEL_EXPORTER_OTLP_HEADERS=' "$env_file"; then
    sed -i "s|^OTEL_EXPORTER_OTLP_HEADERS=.*|$LINE|" "$env_file"
  else
    printf '\n%s\n' "$LINE" >> "$env_file"
  fi
  echo "Set OTEL_EXPORTER_OTLP_HEADERS in apps/$service/.env"
done
echo "Restart Alloy (docker compose --profile observability up -d --force-recreate alloy) and the services."
