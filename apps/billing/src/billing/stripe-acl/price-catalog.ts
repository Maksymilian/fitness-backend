import { Inject, Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { MembershipPlan } from '../memberships/domain/values/membership-plan.js';
import { PLAN_LOOKUP_KEYS, STRIPE_CLIENT } from './stripe-client.js';

/**
 * Stripe's membership prices, by their lookup keys: a price id to its plan (an invoice line names
 * its price by id only), and a plan to its price (a checkout needs the id). Read from Stripe once,
 * then kept in memory; empty without STRIPE_SECRET_KEY.
 */
@Injectable()
export class PriceCatalog {
  #prices?: Promise<Map<string, MembershipPlan>>;

  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null) {}

  /** The plan of a price, from its lookup key; undefined for another price, or without Stripe. */
  async planOf(price: string | Stripe.Price): Promise<MembershipPlan | undefined> {
    if (typeof price !== 'string') {
      return planOfLookupKey(price.lookup_key);
    }
    return (await this.prices()).get(price);
  }

  async priceOf(plan: MembershipPlan): Promise<string | undefined> {
    for (const [id, candidate] of await this.prices()) {
      if (candidate.equals(plan)) return id;
    }
    return undefined;
  }

  private prices(): Promise<Map<string, MembershipPlan>> {
    this.#prices ??= this.load().catch((error: unknown) => {
      this.#prices = undefined; // try again at the next call
      throw error;
    });
    return this.#prices;
  }

  private async load(): Promise<Map<string, MembershipPlan>> {
    if (!this.stripe) {
      return new Map();
    }
    const { data } = await this.stripe.prices.list({ lookup_keys: Object.values(PLAN_LOOKUP_KEYS), active: true, limit: 10 });
    return new Map(data.flatMap((price) => {
      const plan = planOfLookupKey(price.lookup_key);
      return plan ? [[price.id, plan] as const] : [];
    }));
  }
}

export function planOfLookupKey(lookupKey: string | null | undefined): MembershipPlan | undefined {
  if (lookupKey === PLAN_LOOKUP_KEYS.MONTHLY) return MembershipPlan.Monthly;
  if (lookupKey === PLAN_LOOKUP_KEYS.YEARLY) return MembershipPlan.Yearly;
  return undefined;
}
