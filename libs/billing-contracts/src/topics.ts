/** The topic exchange Billing publishes its integration events to. Owned by Billing. */
export const BILLING_EXCHANGE = 'billing.integration';

/**
 * Integration event topics: each one is also the CloudEvent `type` and the RabbitMQ routing key.
 * Every payload is a `MembershipSnapshotV1`.
 */
export const BillingTopics = {
  membershipStartedV1: 'billing.integration.membership-started.v1',
  membershipEndedV1: 'billing.integration.membership-ended.v1',
} as const;

export type BillingTopic = (typeof BillingTopics)[keyof typeof BillingTopics];

/** Matches every Billing integration event, for a queue binding. */
export const BILLING_ROUTING_PATTERN = 'billing.integration.#';
