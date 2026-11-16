import type { Type } from '@nestjs/common';
import type { OutboxMessage, OutboxTransport } from '@nestjs/outbox';
import { inStagedTrace } from './staged-trace.js';

interface Options {
  signal: AbortSignal;
}
// The base as Traced needs it: a constructor that takes whatever Nest passes it, and a concrete
// publish() to call.
type Transport = new (...args: unknown[]) => { publish(message: OutboxMessage, options: Options): unknown };

/**
 * An outbox transport that hands each message to its broker in the trace and flow that staged it
 * (a `relay <topic>` span). The broker's instrumentation continues that trace: the amqplib
 * instrumentation adds the producer span and the message headers the consumer continues from.
 */
export function TracedTransport(Base: Type<OutboxTransport>): Type<OutboxTransport> {
  // Every outbox transport class has a publish() to call; Type<OutboxTransport> just doesn't say so.
  class Traced extends (Base as unknown as Transport) {
    override publish(message: OutboxMessage, options: Options): Promise<void> {
      return inStagedTrace(message, 'relay', async () => {
        await super.publish(message, options);
      });
    }
  }
  return Traced;
}
