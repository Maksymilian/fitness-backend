import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { PaymentProvider } from '../memberships/application/payment-provider.js';
import { PriceCatalog } from './price-catalog.js';
import { ProviderCustomers } from './provider-customers.js';
import { stripeClientProvider } from './stripe-client.js';
import { StripePaymentProvider } from './stripe-payment-provider.js';
import { StripeWebhookModule } from './stripe-webhook.module.js';

/**
 * Billing's anticorruption layer towards Stripe, the only code that knows Stripe: the payment
 * provider's adapter (Checkout, the Billing Portal) and, with STRIPE_WEBHOOK_SECRET, the webhook
 * that translates Stripe's events into Billing's commands.
 */
@Module({
  imports: [ConditionalModule.registerWhen(StripeWebhookModule, (env) => !!env.STRIPE_WEBHOOK_SECRET)],
  providers: [stripeClientProvider, PriceCatalog, ProviderCustomers, { provide: PaymentProvider, useClass: StripePaymentProvider }],
  exports: [PaymentProvider],
})
export class StripeAclModule {}
