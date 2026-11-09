import type { DomainEvent } from '@app/ddd';
import type { EventRoute } from './event-route.interface.js';

type EventClass<E extends DomainEvent> = abstract new (...args: any[]) => E;

/** Maps each kind of domain event to the outbox messages it becomes. An event without routes isn't written. */
export class RouteTable {
  readonly #routes = new Map<EventClass<DomainEvent>, EventRoute[]>();

  route<E extends DomainEvent>(event: EventClass<E>, ...routes: EventRoute<E>[]): this {
    this.#routes.set(event, routes as EventRoute[]);
    return this;
  }

  routesOf(event: DomainEvent): readonly EventRoute[] {
    return this.#routes.get(event.constructor as EventClass<DomainEvent>) ?? [];
  }
}
