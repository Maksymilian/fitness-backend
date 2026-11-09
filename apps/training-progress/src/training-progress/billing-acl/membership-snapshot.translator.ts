import { BILLING_SOURCE, BillingTopics, MembershipSnapshotV1 } from '@app/billing-contracts';
import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CloudEvent, type CloudEventV1, V1 } from 'cloudevents';
import { MemberId } from '../members/domain/values/member-id.js';
import { ChangeGoalAllowanceCommand } from '../training-goals/application/commands/change-goal-allowance.command.js';
import { SourceRevision } from '../training-log/domain/values/source-revision.js';
import { InvalidIntegrationEvent } from '../workout-tracking-acl/invalid-integration-event.js';

/**
 * The anticorruption layer's translation of Billing's membership events into this context's
 * language: a membership that started becomes Extend Goal Allowance, one that ended Restrict Goal
 * Allowance; the membership's revision becomes the source revision. Billing's plans, dates and
 * renewal don't matter here. Contract classes go no further than this.
 */
@Injectable()
export class MembershipSnapshotTranslator {
  async translate(event: CloudEventV1<unknown>): Promise<ChangeGoalAllowanceCommand> {
    const type = typeof event?.type === 'string' && event.type.length > 0 ? event.type : 'message';
    const snapshot = plainToInstance(MembershipSnapshotV1, cloudEventData(event, type) ?? {});
    const errors = await validate(snapshot, { whitelist: true });
    if (errors.length > 0) {
      throw new InvalidIntegrationEvent(type, errors.flatMap((error) => Object.values(error.constraints ?? {})).join('; '));
    }
    const change = type === BillingTopics.membershipStartedV1 ? 'extend' : type === BillingTopics.membershipEndedV1 ? 'restrict' : undefined;
    if (!change) {
      throw new InvalidIntegrationEvent(type, 'not a membership event Training Progress knows');
    }
    try {
      return new ChangeGoalAllowanceCommand(MemberId.from(snapshot.memberId), change, SourceRevision.of(snapshot.revision), event.id);
    } catch (error) {
      throw new InvalidIntegrationEvent(type, (error as Error).message);
    }
  }
}

/** Checks the event against the CloudEvents specification and Billing's source, and returns its data. */
function cloudEventData(event: CloudEventV1<unknown>, type: string): unknown {
  if (event?.specversion !== V1 || typeof event.id !== 'string' || event.id.length === 0) {
    throw new InvalidIntegrationEvent(type, `not a CloudEvent ${V1} with an id`);
  }
  let valid: CloudEvent<unknown>;
  try {
    valid = new CloudEvent<unknown>(event);
  } catch (error) {
    throw new InvalidIntegrationEvent(type, (error as Error).message.split('\n')[0]);
  }
  if (valid.source !== BILLING_SOURCE) {
    throw new InvalidIntegrationEvent(type, `the source is ${valid.source}, not ${BILLING_SOURCE}`);
  }
  return valid.data;
}
