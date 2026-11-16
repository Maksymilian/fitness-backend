import { Controller, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Ctx, EventPattern, Payload, type RmqContext } from '@nestjs/microservices';
import type { CloudEventV1 } from 'cloudevents';
import { ScheduleTriggers } from '../../../../platform/messaging/schedule-triggers.js';
import { MissEndedGoalsCommand } from '../../application/commands/miss-ended-goals.command.js';

interface Channel {
  ack(message: unknown): void;
  nack(message: unknown, allUpTo: boolean, requeue: boolean): void;
}

/**
 * Training goals' schedule triggers, from the schedule queue: a Kubernetes CronJob publishes them
 * (scripts/scheduler), and the instance that receives one handles it. Acked once the work is done;
 * a failure is requeued, and RabbitMQ dead-letters it after its delivery limit: an incident.
 */
@Controller()
export class ScheduleTriggersController {
  private readonly logger = new Logger(ScheduleTriggersController.name);

  constructor(private readonly commandBus: CommandBus) {}

  @EventPattern(ScheduleTriggers.types.missEndedGoalsV1)
  async missEndedGoals(@Payload() trigger: CloudEventV1<unknown>, @Ctx() rmq: unknown): Promise<void> {
    const context = rmq as RmqContext;
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage();
    try {
      const missed = await this.commandBus.execute(new MissEndedGoalsCommand(new Date()));
      this.logger.log(`Missed ${missed} ended training goals (${trigger?.type} ${trigger?.id})`);
      channel.ack(message);
    } catch (error) {
      this.logger.warn(`Requeueing ${trigger?.type} ${trigger?.id}: ${(error as Error).message}`);
      channel.nack(message, false, true);
    }
  }
}
