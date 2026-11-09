import type { OutgoingEvent, ProducerSerializer } from '@nestjs/microservices';
import { CloudEvent, CONSTANTS } from 'cloudevents';

/**
 * Writes what the RabbitMQ client emits in the structured content mode of the CloudEvents AMQP
 * binding: the body is the event in the JSON event format, and the content type
 * `application/cloudevents+json`. The client sends the returned `options` as message properties,
 * and the rest as the body, instead of its own `{ pattern, data }` packet. The routing key stays
 * the pattern: the event's type.
 */
export class CloudEventSerializer implements ProducerSerializer {
  serialize(packet: OutgoingEvent) {
    if (!(packet.data instanceof CloudEvent)) {
      throw new TypeError(`Only CloudEvents go to RabbitMQ, not ${String(packet.pattern)}`);
    }
    const event: CloudEvent<unknown> = packet.data;
    return {
      ...event.toJSON(),
      options: { contentType: CONSTANTS.DEFAULT_CE_CONTENT_TYPE, messageId: event.id, type: event.type },
    };
  }
}
