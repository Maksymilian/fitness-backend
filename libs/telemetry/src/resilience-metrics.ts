import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import type { ResilienceEvent } from '@nestjs/resilience';
import { metrics } from '@opentelemetry/api';

const EVENT_TYPES = [
  'retry',
  'timeout',
  'circuit-open',
  'circuit-half-open',
  'circuit-closed',
  'circuit-rejected',
  'bulkhead-rejected',
  'rate-limited',
  'fallback',
] as const satisfies ReadonlyArray<ResilienceEvent['type']>;

/**
 * Counts @nestjs/resilience's events (docs/architecture.md, section 16) as `resilience.events` (in
 * Prometheus, `resilience_events_total`): by type (`timeout`, `retry`, `circuit-open`...), the name
 * it was configured under, and its source, the entrypoint (`MemberResolver.trainingGoals`). Read
 * from the package's diagnostics channels (`nestjs:resilience:<type>`), so this library only needs
 * its types. Answers a function that stops counting.
 */
export function countResilienceEvents(): () => void {
  const events = metrics.getMeter('@app/telemetry').createCounter('resilience.events', {
    unit: '{event}',
    description: 'Timeouts, retries, circuit breaker transitions and rejections of @nestjs/resilience',
  });
  const count = (message: unknown) => {
    const event = message as ResilienceEvent;
    events.add(1, { 'resilience.event': event.type, 'resilience.name': event.policy, ...(event.source ? { 'resilience.source': event.source } : {}) });
  };
  for (const type of EVENT_TYPES) {
    subscribe(`nestjs:resilience:${type}`, count);
  }
  return () => {
    for (const type of EVENT_TYPES) {
      unsubscribe(`nestjs:resilience:${type}`, count);
    }
  };
}
