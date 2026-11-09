import type { DomainEvent, Transaction } from '@app/ddd';

/**
 * Port: stores an aggregate's domain events in the outbox, in the transaction that saves the
 * aggregate. Never publishes from memory.
 */
export abstract class DomainEventPublisher {
  abstract publish(tx: Transaction, events: readonly DomainEvent[]): Promise<void>;
}
