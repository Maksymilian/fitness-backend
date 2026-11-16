import type { DomainEvent } from './domain-event.js';

/**
 * The root of an aggregate: records the domain events of its changes, which the application
 * layer pulls once and writes to the outbox in the transaction that saves the aggregate.
 */
export abstract class AggregateRoot<E extends DomainEvent = DomainEvent> {
  private domainEvents: E[] = [];

  /**
   * The version the aggregate was loaded at, 0 when it's new. Optimistic locking: the repository
   * saves it only while the stored version still matches, and fails with `ConcurrencyConflict`.
   */
  protected constructor(readonly version: number) {}

  protected record(event: E): void {
    this.domainEvents.push(event);
  }

  /** The events recorded since the last call, oldest first. Each event is handed over once. */
  pullDomainEvents(): E[] {
    const events = this.domainEvents;
    this.domainEvents = [];
    return events;
  }

  /** Whether the aggregate recorded a change that hasn't been pulled yet. */
  hasChanges(): boolean {
    return this.domainEvents.length > 0;
  }
}
