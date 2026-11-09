import { BILLING_EXCHANGE, BILLING_ROUTING_PATTERN } from '@app/billing-contracts';

/**
 * Training Progress' subscription to Billing's published language (architecture 18.4): a quorum
 * queue bound to Billing's exchange, with a single active consumer to keep the order across
 * instances, dead-lettered through the default exchange to its own DLQ after 5 deliveries. The same
 * arguments are declared in infrastructure/rabbitmq/definitions.json; RabbitMQ refuses a queue
 * redeclared differently.
 */
export const BillingSubscription = {
  exchange: BILLING_EXCHANGE,
  routingKey: BILLING_ROUTING_PATTERN,
  queue: 'training-progress.billing',
  deadLetterQueue: 'training-progress.billing.dlq',
  queueArguments: {
    'x-queue-type': 'quorum',
    'x-single-active-consumer': true,
    'x-delivery-limit': 5,
    'x-dead-letter-exchange': '',
    'x-dead-letter-routing-key': 'training-progress.billing.dlq',
  },
} as const;
