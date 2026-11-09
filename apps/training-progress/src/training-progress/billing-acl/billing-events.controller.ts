import { BillingTopics } from '@app/billing-contracts';
import { Controller, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Ctx, EventPattern, Payload, type RmqContext } from '@nestjs/microservices';
import type { CloudEventV1 } from 'cloudevents';
import { InvalidIntegrationEvent } from '../workout-tracking-acl/invalid-integration-event.js';
import { MembershipSnapshotTranslator } from './membership-snapshot.translator.js';

/**
 * The anticorruption layer's handlers for Billing's integration events, from the
 * `training-progress.billing` queue. Acked only after the transaction committed; an invalid event is
 * dead-lettered at once; any other failure is requeued until RabbitMQ's delivery limit.
 */
@Controller()
export class BillingEventsController {
  private readonly logger = new Logger(BillingEventsController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly translator: MembershipSnapshotTranslator,
  ) {}

  @EventPattern(BillingTopics.membershipStartedV1)
  membershipStarted(@Payload() event: CloudEventV1<unknown>, @Ctx() rmq: unknown) {
    return this.apply(event, rmq);
  }

  @EventPattern(BillingTopics.membershipEndedV1)
  membershipEnded(@Payload() event: CloudEventV1<unknown>, @Ctx() rmq: unknown) {
    return this.apply(event, rmq);
  }

  private async apply(event: CloudEventV1<unknown>, rmq: unknown): Promise<void> {
    const context = rmq as RmqContext;
    const channel = context.getChannelRef() as { ack(message: unknown): void; nack(message: unknown, allUpTo: boolean, requeue: boolean): void };
    const message = context.getMessage();
    try {
      await this.commandBus.execute(await this.translator.translate(event));
      channel.ack(message);
    } catch (error) {
      const invalid = error instanceof InvalidIntegrationEvent;
      this.logger.warn(`${invalid ? 'Dead-lettering' : 'Requeueing'} ${event?.type} ${event?.id}: ${(error as Error).message}`);
      channel.nack(message, false, !invalid);
    }
  }
}
