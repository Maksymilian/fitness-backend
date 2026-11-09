import type { DomainEvent } from '@app/ddd';

/** One outbox message a domain event becomes. */
export interface EventRoute<E extends DomainEvent = DomainEvent> {
  topic: string;
  /** Messages that share a key are published one at a time, in commit order. */
  key: (event: E) => string | null;
  payload: (event: E) => unknown;
}
