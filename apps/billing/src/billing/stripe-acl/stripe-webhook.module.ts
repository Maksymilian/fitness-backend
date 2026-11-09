import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhooksModule } from '@nestjs/webhooks';
import type { Environment } from '../../platform/config/environment.js';
import { PriceCatalog } from './price-catalog.js';
import { ProviderCustomers } from './provider-customers.js';
import { stripeClientProvider } from './stripe-client.js';
import { StripeEventsController } from './stripe-events.controller.js';
import { StripeEventTranslator } from './stripe-event.translator.js';

/**
 * Receives Stripe's events with `@nestjs/webhooks`: receive-only, so no store of its own. Its own
 * deduplication is off: each command records the event's id in the outbox's inbox (consumer
 * `webhooks:stripe`) in the transaction of its change, which is what makes it exactly once.
 */
@Module({
  imports: [
    WebhooksModule.forRootAsync({
      outgoing: false,
      isGlobal: false,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        receivers: { stripe: { scheme: 'stripe', secret: config.get('STRIPE_WEBHOOK_SECRET', { infer: true })!, dedupe: false } },
      }),
    }),
  ],
  controllers: [StripeEventsController],
  providers: [stripeClientProvider, PriceCatalog, ProviderCustomers, StripeEventTranslator],
})
export class StripeWebhookModule {}
