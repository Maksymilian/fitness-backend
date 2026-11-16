import { ClientRMQ } from '@nestjs/microservices';
import type { OutboxMessage } from '@nestjs/outbox';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { CloudEvent } from 'cloudevents';
import { lastValueFrom } from 'rxjs';
import { toCloudEvent } from '../../workout-tracking/published-language/cloud-event.mapper.js';
import { CloudEventSerializer } from './cloud-event.serializer.js';

const EXCHANGE = 'workout-tracking.integration';

const recorded: OutboxMessage = {
  id: '01a0f335-aae8-7027-b795-ca9dab21e44d',
  topic: 'workout-tracking.integration.workout-recorded.v1',
  key: 'ada@example.com',
  headers: {},
  createdAt: Date.parse('2026-10-08T09:30:12.000Z'),
  availableAt: Date.parse('2026-10-08T09:30:12.000Z'),
  attempts: 0,
  lastError: null,
  payload: {
    workoutId: '0199c3a2-0000-7000-8000-000000000101',
    memberId: 'ada@example.com',
    equipmentType: 'BIKE',
    discipline: 'CYCLING',
    startedAt: '2026-10-08T08:30:00.000Z',
    durationSeconds: 2700,
    distanceMeters: 18200,
    calories: 530,
    status: 'RECORDED',
    revision: 1,
  },
};

/**
 * The exchange and the binding pattern of infrastructure/rabbitmq/definitions.json, on a real
 * RabbitMQ (Testcontainers, the image compose.yaml also runs): the RabbitMQ client, configured as
 * in PlatformModule, really delivers the integration event as a structured-mode CloudEvent, routed
 * by its type, to a queue subscribed the way Training Progress is.
 */
describe('CloudEventSerializer, published to a real RabbitMQ', () => {
  let container: StartedRabbitMQContainer;
  let connection: ChannelModel;
  let channel: Channel;
  let queue: string;
  let client: ClientRMQ;

  beforeAll(async () => {
    container = await new RabbitMQContainer('rabbitmq:4-management-alpine').start();
    connection = await connect(container.getAmqpUrl());
    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    ({ queue } = await channel.assertQueue('', { exclusive: true }));
    await channel.bindQueue(queue, EXCHANGE, `${EXCHANGE}.#`);

    client = new ClientRMQ({
      urls: [container.getAmqpUrl()],
      exchange: EXCHANGE,
      exchangeType: 'topic',
      wildcards: true,
      persistent: true,
      serializer: new CloudEventSerializer(),
    });
    await client.connect();
    // On a CI runner the image is pulled first, alongside the other suites' containers.
  }, 180_000);

  // Optional chaining: when the setup failed, its own error is the one to report.
  afterAll(async () => {
    await client?.close();
    await channel?.close();
    await connection?.close();
    await container?.stop();
  });

  it('delivers the integration event as a structured-mode CloudEvent, routed by its type', async () => {
    const delivered = new Promise<ConsumeMessage>((resolve) => {
      void channel.consume(queue, (message) => message && resolve(message), { noAck: true });
    });

    await lastValueFrom(client.emit(recorded.topic, toCloudEvent(recorded)), { defaultValue: undefined });
    const message = await delivered;

    expect(message.fields.routingKey).toBe(recorded.topic);
    expect(message.properties).toMatchObject({
      contentType: 'application/cloudevents+json; charset=utf-8',
      messageId: recorded.id,
      deliveryMode: 2, // persistent
    });
    const body = JSON.parse(message.content.toString()) as Record<string, unknown>;
    expect(body).toEqual({
      specversion: '1.0',
      id: recorded.id,
      source: '/workout-tracking',
      type: recorded.topic,
      subject: '0199c3a2-0000-7000-8000-000000000101',
      time: '2026-10-08T09:30:12.000Z',
      datacontenttype: 'application/json',
      partitionkey: 'ada@example.com',
      data: recorded.payload,
    });
    expect(new CloudEvent(body).validate()).toBe(true);
  }, 15_000);
});
