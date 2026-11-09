import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { RecordPaymentCommand } from '../ledger/application/commands/record-payment.command.js';
import { RecordRefundCommand } from '../ledger/application/commands/record-refund.command.js';
import { Currency } from '../ledger/domain/values/currency.js';
import { Money } from '../ledger/domain/values/money.js';
import { ChangeMembershipCommand, type MembershipChange } from '../memberships/application/commands/change-membership.command.js';
import { MemberId } from '../memberships/domain/values/member-id.js';
import { MembershipPlan } from '../memberships/domain/values/membership-plan.js';
import { ProviderReference } from '../memberships/domain/values/provider-reference.js';
import { InvalidStripeEvent } from './invalid-stripe-event.js';
import { PriceCatalog, planOfLookupKey } from './price-catalog.js';
import { ProviderCustomers } from './provider-customers.js';
import { METADATA } from './stripe-client.js';

/** The Stripe events Billing listens to: the Stripe CLI and the Dashboard's endpoint send these. */
export const STRIPE_EVENT_TYPES = ['invoice.paid', 'charge.refunded', 'customer.subscription.updated', 'customer.subscription.deleted'] as const;

/** What a Stripe event is in Billing's language: commands, or nothing, with why. */
export type StripeEventTranslation =
  | { commands: (RecordPaymentCommand | RecordRefundCommand | ChangeMembershipCommand)[]; customer?: { memberId: string; customerReference: string } }
  | { commands: []; ignored: string };

const ignore = (ignored: string): StripeEventTranslation => ({ commands: [], ignored });

/**
 * The anticorruption layer's translation of Stripe's events into Billing's commands. Stripe's words
 * (invoice, charge, subscription, customer) stop here:
 * - `invoice.paid` of a membership's subscription → Record Payment (Apply Payment then starts or renews it);
 * - `charge.refunded` → Record Refund, for what was refunded by this event;
 * - `customer.subscription.updated` → Cancel, Resume or Switch Plan, from what changed;
 * - `customer.subscription.deleted` → End.
 * Every command carries the event's id, so the inbox applies it once. Events for anything that isn't
 * a membership (another product, a one-off invoice) are ignored.
 */
@Injectable()
export class StripeEventTranslator {
  constructor(
    private readonly prices: PriceCatalog,
    private readonly customers: ProviderCustomers,
  ) {}

  async translate(event: Stripe.Event): Promise<StripeEventTranslation> {
    if (typeof event?.id !== 'string' || typeof event.type !== 'string' || typeof event.data?.object !== 'object') {
      throw new InvalidStripeEvent(String(event?.type), 'not a Stripe event');
    }
    try {
      switch (event.type) {
        case 'invoice.paid':
          return await this.invoicePaid(event.id, event.data.object);
        case 'charge.refunded':
          return await this.chargeRefunded(event.id, event.created, event.data.object, event.data.previous_attributes);
        case 'customer.subscription.updated':
          return await this.subscriptionUpdated(event.id, event.data.object, event.data.previous_attributes);
        case 'customer.subscription.deleted':
          return this.subscriptionDeleted(event.id, event.data.object);
        default:
          return ignore(`Billing doesn't listen to ${event.type}`);
      }
    } catch (error) {
      if (error instanceof InvalidStripeEvent) throw error;
      // A value object refused it (an unknown currency, a malformed id): retrying can't fix it.
      throw new InvalidStripeEvent(event.type, (error as Error).message);
    }
  }

  private async invoicePaid(eventId: string, invoice: Stripe.Invoice): Promise<StripeEventTranslation> {
    const details = invoice.parent?.subscription_details;
    const memberId = details?.metadata?.[METADATA.memberId];
    if (!details || !memberId) {
      return ignore(`invoice ${invoice.id} isn't a membership's`);
    }
    const subscription = idOf(details.subscription);
    const periodEnd = Math.max(...invoice.lines.data.map((line) => line.period.end));
    if (!Number.isFinite(periodEnd)) {
      throw new InvalidStripeEvent('invoice.paid', `invoice ${invoice.id} has no lines`);
    }
    const plan = (await this.planOfLines(invoice.lines.data)) ?? MembershipPlan.from(details.metadata?.[METADATA.plan] ?? '');
    const customerReference = idOf(invoice.customer);
    return {
      commands: [
        new RecordPaymentCommand(
          MemberId.from(memberId),
          Money.ofMinorUnits(invoice.amount_paid, Currency.from(invoice.currency)),
          fromUnixTime(invoice.status_transitions.paid_at ?? invoice.created),
          ProviderReference.from(invoice.id),
          { plan, paidThrough: fromUnixTime(periodEnd), membershipReference: ProviderReference.from(subscription) },
          eventId,
        ),
      ],
      ...(customerReference ? { customer: { memberId, customerReference } } : {}),
    };
  }

  private async chargeRefunded(
    eventId: string,
    created: number,
    charge: Stripe.Charge,
    previous: Partial<Stripe.Charge> | undefined,
  ): Promise<StripeEventTranslation> {
    const customerReference = idOf(charge.customer);
    const memberId = customerReference && (await this.customers.memberOf(customerReference));
    if (!memberId) {
      return ignore(`charge ${charge.id} isn't a member's: no payment of its customer was recorded`);
    }
    // Each refund of a charge is an event of its own: what this one refunded is the difference.
    const refunded = charge.amount_refunded - (previous?.amount_refunded ?? 0);
    if (refunded <= 0) {
      return ignore(`charge ${charge.id} refunded nothing new`);
    }
    return {
      commands: [
        new RecordRefundCommand(
          MemberId.from(memberId),
          Money.ofMinorUnits(refunded, Currency.from(charge.currency)),
          fromUnixTime(created),
          // The charge and how much of it was refunded by then: unique per refund of the charge.
          ProviderReference.from(`${charge.id}:${charge.amount_refunded}`),
          eventId,
        ),
      ],
    };
  }

  private async subscriptionUpdated(
    eventId: string,
    subscription: Stripe.Subscription,
    previous: Partial<Stripe.Subscription> | undefined,
  ): Promise<StripeEventTranslation> {
    if (!subscription.metadata?.[METADATA.memberId] || !previous) {
      return ignore(`subscription ${subscription.id} isn't a membership's, or nothing changed`);
    }
    const changes: MembershipChange[] = [];
    if ('items' in previous) {
      const plan = await this.planOfItems(subscription.items?.data ?? []);
      const before = await this.planOfItems(previous.items?.data ?? []);
      if (plan && !(before && before.equals(plan))) {
        changes.push({ kind: 'switch-plan', plan });
      }
    }
    if ('cancel_at_period_end' in previous || 'cancel_at' in previous) {
      const ends = endsWithoutRenewal(subscription);
      const ended = endsWithoutRenewal({ ...subscription, ...previous } as Stripe.Subscription);
      if (ends !== ended) {
        changes.push({ kind: ends ? 'cancel' : 'resume' });
      }
    }
    if (changes.length === 0) {
      return ignore(`subscription ${subscription.id} changed nothing Billing keeps`);
    }
    const reference = ProviderReference.from(subscription.id);
    // One message id per change, so the inbox applies each once.
    return { commands: changes.map((change, index) => new ChangeMembershipCommand(reference, change, index === 0 ? eventId : `${eventId}:${change.kind}`)) };
  }

  private subscriptionDeleted(eventId: string, subscription: Stripe.Subscription): StripeEventTranslation {
    if (!subscription.metadata?.[METADATA.memberId]) {
      return ignore(`subscription ${subscription.id} isn't a membership's`);
    }
    return { commands: [new ChangeMembershipCommand(ProviderReference.from(subscription.id), { kind: 'end' }, eventId)] };
  }

  private async planOfLines(lines: Stripe.InvoiceLineItem[]): Promise<MembershipPlan | undefined> {
    for (const line of lines) {
      const price = line.pricing?.price_details?.price;
      const plan = price && (await this.prices.planOf(price));
      if (plan) return plan;
    }
    return undefined;
  }

  private async planOfItems(items: Stripe.SubscriptionItem[]): Promise<MembershipPlan | undefined> {
    for (const item of items) {
      // Subscription items carry the whole price, lookup key included.
      const plan = planOfLookupKey(item.price?.lookup_key) ?? (item.price && (await this.prices.planOf(item.price.id)));
      if (plan) return plan;
    }
    return undefined;
  }
}

/** Renewal is off: the subscription ends at the end of its period, or at a set time. */
function endsWithoutRenewal(subscription: Pick<Stripe.Subscription, 'cancel_at_period_end' | 'cancel_at'>): boolean {
  return subscription.cancel_at_period_end || subscription.cancel_at !== null;
}

function idOf(value: string | { id: string } | null | undefined): string {
  return typeof value === 'string' ? value : (value?.id ?? '');
}

function fromUnixTime(seconds: number): Date {
  return new Date(seconds * 1000);
}
