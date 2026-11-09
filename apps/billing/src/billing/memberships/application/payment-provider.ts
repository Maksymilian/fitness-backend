import type { MemberId } from '../domain/values/member-id.js';
import type { MembershipPlan } from '../domain/values/membership-plan.js';

/** A page of the payment provider's that the member is sent to. */
export interface ProviderPage {
  url: string;
}

/**
 * Port: the payment provider's hosted pages (Stripe Checkout and its Billing Portal). Members pay
 * and manage their payment details there, never in the platform. Its adapter is the anticorruption
 * layer's (`stripe-acl/`).
 */
export abstract class PaymentProvider {
  /** A checkout for the plan. Paying on it starts the membership, through the provider's event. */
  abstract startCheckout(memberId: MemberId, plan: MembershipPlan): Promise<ProviderPage>;

  /** The billing portal of a member the provider knows. */
  abstract openBillingPortal(memberId: MemberId): Promise<ProviderPage>;
}

/** The inbox consumer of the payment provider's events: each one is applied once. */
export const PAYMENT_PROVIDER_CONSUMER = 'webhooks:stripe';
