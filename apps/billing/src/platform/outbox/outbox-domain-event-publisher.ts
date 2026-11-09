import type { DomainEvent, Transaction } from '@app/ddd';
import { traceHeaders } from '@app/telemetry';
import { Injectable } from '@nestjs/common';
import { type NewOutboxMessage, Outbox } from '@nestjs/outbox';
import { v5 as uuidv5 } from 'uuid';
import type { DrizzleTransaction } from '../database/database.js';
import { DomainEventPublisher } from './domain-event-publisher.js';
import { RouteTable } from './route-table.js';

/**
 * Adds each domain event's messages, from the route table, to the outbox through the domain
 * transaction. The first message's id is the event's id; a second message of the same event gets
 * an id derived from it, so redeliveries keep their id.
 */
@Injectable()
export class OutboxDomainEventPublisher extends DomainEventPublisher {
  constructor(
    private readonly outbox: Outbox<DrizzleTransaction>,
    private readonly routes: RouteTable,
  ) {
    super();
  }

  async publish(tx: Transaction, events: readonly DomainEvent[]): Promise<void> {
    const messages: NewOutboxMessage[] = events.flatMap((event) =>
      this.routes.routesOf(event).map((route, index) => ({
        id: index === 0 ? event.eventId : uuidv5(route.topic, event.eventId),
        topic: route.topic,
        key: route.key(event),
        payload: route.payload(event),
        // The trace and flow of the change: the relay delivers the message outside it.
        headers: traceHeaders(),
      })),
    );
    if (messages.length > 0) {
      await this.outbox.add(tx as unknown as DrizzleTransaction, messages);
    }
  }
}
