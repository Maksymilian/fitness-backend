import { BILLING_EXCHANGE } from '@app/billing-contracts';

/** The RabbitMQ topic exchange the published language goes to: each topic is its routing key. */
export const PUBLISHED_LANGUAGE_EXCHANGE = BILLING_EXCHANGE;

/** Whether an outbox message belongs to the published language, and goes to RabbitMQ. */
export function isPublishedLanguage(topic: string): boolean {
  return topic.startsWith(`${BILLING_EXCHANGE}.`);
}
