import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import type { Environment } from '../../platform/config/environment.js';
import { PaymentProvider, type ProviderPage } from '../memberships/application/payment-provider.js';
import { MembershipNotFound } from '../memberships/domain/errors/membership-not-found.js';
import type { MemberId } from '../memberships/domain/values/member-id.js';
import type { MembershipPlan } from '../memberships/domain/values/membership-plan.js';
import { PriceCatalog } from './price-catalog.js';
import { ProviderCustomers } from './provider-customers.js';
import { METADATA, STRIPE_CLIENT } from './stripe-client.js';

/**
 * The payment provider, Stripe: its hosted Checkout in subscription mode, and its Billing Portal.
 * The member's id goes into the subscription's metadata, which Stripe copies onto every invoice: the
 * anticorruption layer finds the member there. No card data ever reaches the platform.
 */
@Injectable()
export class StripePaymentProvider extends PaymentProvider {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly prices: PriceCatalog,
    private readonly customers: ProviderCustomers,
    private readonly config: ConfigService<Environment, true>,
  ) {
    super();
  }

  async startCheckout(memberId: MemberId, plan: MembershipPlan): Promise<ProviderPage> {
    const stripe = this.client();
    const price = await this.prices.priceOf(plan);
    if (!price) {
      throw new ServiceUnavailableException(`Stripe's catalog has no price for ${plan.value}: run pnpm stripe:seed-catalog`);
    }
    const customer = await this.customers.customerOf(memberId.value);
    const metadata = { [METADATA.memberId]: memberId.value, [METADATA.plan]: plan.value };
    const page = this.config.get('MEMBERSHIP_PAGE_URL', { infer: true });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      // Until Identity exists, the member id is their email address.
      ...(customer ? { customer } : { customer_email: memberId.value }),
      subscription_data: { metadata },
      metadata,
      success_url: `${page}?checkout=completed`,
      cancel_url: `${page}?checkout=abandoned`,
    });
    if (!session.url) {
      throw new ServiceUnavailableException('Stripe opened a checkout without a URL');
    }
    return { url: session.url };
  }

  async openBillingPortal(memberId: MemberId): Promise<ProviderPage> {
    const stripe = this.client();
    const customer = await this.customers.customerOf(memberId.value);
    if (!customer) {
      throw new MembershipNotFound(memberId.value);
    }
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: this.config.get('MEMBERSHIP_PAGE_URL', { infer: true }) });
    return { url: session.url };
  }

  private client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('The payment provider is not configured: set STRIPE_SECRET_KEY');
    }
    return this.stripe;
  }
}
