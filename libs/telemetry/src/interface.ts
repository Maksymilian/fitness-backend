import { context, propagation, trace } from '@opentelemetry/api';
import { getRPCMetadata } from '@opentelemetry/core';

/**
 * The interface an interaction reached the platform through: `graphql`, `rest`, `telegram` (the
 * bot), or `rabbitmq` for a message that no interaction started (a schedule trigger). It is set
 * where the interaction enters, and travels with it like the flow id: as W3C Baggage
 * (`baggage: interface=<name>`) in HTTP requests, RabbitMQ messages and outbox messages' headers.
 * The baggage processors copy it to every span and log record, so Grafana can show one interface.
 */
export const INTERFACE = 'interface';

export type InterfaceName = 'graphql' | 'rest' | 'telegram' | 'stripe' | 'rabbitmq';

/** The interface of the active context, if there is one. */
export function currentInterface(): string | undefined {
  return propagation.getBaggage(context.active())?.getEntry(INTERFACE)?.value;
}

/**
 * Runs `work` in the interface the caller's baggage names (a message caused by a REST request
 * keeps `rest`), or in `name`, which it also records on the roundtrip's entry span, started
 * before: the HTTP server span (which the HTTP instrumentation keeps in the context), or the
 * active span (the bot's span of an update).
 */
export function inInterface<T>(name: InterfaceName, work: () => T): T {
  const active = context.active();
  const baggage = propagation.getBaggage(active) ?? propagation.createBaggage();
  if (baggage.getEntry(INTERFACE)) {
    return work();
  }
  (getRPCMetadata(active)?.span ?? trace.getSpan(active))?.setAttribute(INTERFACE, name);
  return context.with(propagation.setBaggage(active, baggage.setEntry(INTERFACE, { value: name })), work);
}
