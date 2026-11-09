import { BILLING_SOURCE, type MembershipSnapshotV1 } from '@app/billing-contracts';
import type { OutboxMessage } from '@nestjs/outbox';
import { CloudEvent, CONSTANTS } from 'cloudevents';

/**
 * Wraps an integration event from the outbox in the CloudEvent it travels as to other services.
 * The id is the outbox message's, so a republished event keeps it; `time` is when the message was
 * added, in the transaction that recorded the change. Throws if the event breaks the specification.
 */
export function toCloudEvent(message: OutboxMessage): CloudEvent<MembershipSnapshotV1> {
  // Every route of the published language carries a membership snapshot (platform/outbox/routes.ts).
  const snapshot = message.payload as MembershipSnapshotV1;
  return new CloudEvent<MembershipSnapshotV1>({
    id: message.id,
    source: BILLING_SOURCE,
    type: message.topic,
    subject: snapshot.membershipId,
    time: new Date(message.createdAt).toISOString(),
    datacontenttype: CONSTANTS.MIME_JSON,
    ...(message.key === null ? {} : { partitionkey: message.key }),
    data: snapshot,
  });
}
