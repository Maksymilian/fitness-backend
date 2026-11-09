import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Environment } from '../../platform/config/environment.js';

/** The Stripe SDK's client, or null without STRIPE_SECRET_KEY (checkouts and the billing portal answer 503). */
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/** The prices' lookup keys in Stripe's catalog, which scripts/stripe/seed-catalog.mjs creates. */
export const PLAN_LOOKUP_KEYS = { MONTHLY: 'membership-monthly', YEARLY: 'membership-yearly' } as const;

/** The subscription metadata Billing sets at checkout: Stripe copies it onto every invoice. */
export const METADATA = { memberId: 'member_id', plan: 'membership_plan' } as const;

export const stripeClientProvider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Environment, true>): Stripe | null => {
    const key = config.get('STRIPE_SECRET_KEY', { infer: true });
    // The SDK pins its API version (2026-09-30.endive with stripe 23.0.0): the translator is written for it.
    return key ? new Stripe(key, { maxNetworkRetries: 2, timeout: 10_000, appInfo: { name: 'fitness-platform-billing' } }) : null;
  },
};
