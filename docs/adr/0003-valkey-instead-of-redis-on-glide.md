# 3. Valkey instead of Redis, on the Valkey GLIDE client

- **Status:** Withdrawn on 2026-11-07: Training Progress is back on Redis (`@keyv/redis`, `@redis/client`); the migration wasn't needed yet. Kept for when Valkey is reconsidered.
- **Date:** 2026-10-30
- **Related:** `docs/architecture.md` sections 8, 15 and 16

## Context

Training Progress keeps its read cache and its load locks (section 8.1) in Redis, through `@keyv/redis` and `@redis/client`, traced by `@opentelemetry/instrumentation-redis`. Valkey, the Linux Foundation's fork of Redis, speaks the same protocol, runs the same Lua scripts and answers the same `INFO`, and managed Valkey costs less than managed Redis at the cloud providers. We want Valkey's server, and its own client, not a Redis client pointed at it.

The Valkey clients for Node.js are iovalkey (under `@keyv/valkey`) and Valkey GLIDE (`@valkey/valkey-glide`). No OpenTelemetry instrumentation covers iovalkey: cache and lock commands would disappear from the traces. GLIDE has its own OpenTelemetry in its Rust core, but no Keyv adapter.

## Decision

1. **Valkey 9 replaces Redis** in Compose (`valkey`, `valkey/valkey:9-alpine`), in the lock store's contract test (`@testcontainers/valkey`), and by name everywhere: `VALKEY_URL`, `ValkeyStore`, `ValkeyLockStore`, `ValkeyHealthIndicator` (readiness key `valkey`), the Toxiproxy proxy `training-progress-valkey`, Alloy's scrape job `valkey`, the dashboard and the alert rules (`valkey-unreachable`, `valkey-memory-near-limit`, `valkey-evictions`).
2. **Valkey GLIDE is the one client**, for the cache and the locks. The cache's store, `ValkeyStore`, is Keyv's promise-based store contract on GLIDE, written by hand because no adapter exists; Keyv still serializes the values and prefixes the keys. `ValkeyLockStore` is the docs' Redis store with each Lua script run through `invokeScript`.
3. **GLIDE's own OpenTelemetry traces the commands**, to the same Alloy endpoint with the same Basic Auth (`OTEL_EXPORTER_OTLP_HEADERS`), as children of the active span. `@opentelemetry/instrumentation-redis` is no longer enabled.
4. **The server's metrics stay as they are:** Alloy's embedded Redis exporter reads Valkey's `INFO`, so the metrics keep the exporter's `redis_` names.

## Consequences

- GLIDE samples commands by its own share (`VALKEY_TRACE_SAMPLE_PERCENTAGE`, 5 by default, 100 locally), not by the SDK's sampler, and traces commands outside a trace too (the readiness probe's round trip), which instrumentation-redis skipped (`requireParentSpan`).
- GLIDE ships a native binary per platform (glibc and musl, x64 and arm64): the container images must match one.
- The alert rules have new uids, so Grafana starts their history afresh.
- `ValkeyStore` is our code, and its contract is Keyv's: a Keyv upgrade must be checked against it.
- The command-latency panel is unchanged: it reads the server's `INFO` latency, not client spans.
