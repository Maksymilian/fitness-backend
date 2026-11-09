/**
 * The CloudEvents `source` of every Billing integration event. Each one travels between services as
 * a CloudEvent 1.0 (https://cloudevents.io) in the JSON event format, with:
 * - `id`: unique per event and the same on every redelivery, so consumers deduplicate on it;
 * - `source`: this value;
 * - `type`: the topic (`BillingTopics`), also the RabbitMQ routing key;
 * - `subject`: the membership id;
 * - `time`: when the change was recorded;
 * - `partitionkey` (Partitioning extension): the member id, so a member's events keep their order;
 * - `datacontenttype`: `application/json`, and `data`: a `MembershipSnapshotV1`.
 */
export const BILLING_SOURCE = '/billing';
