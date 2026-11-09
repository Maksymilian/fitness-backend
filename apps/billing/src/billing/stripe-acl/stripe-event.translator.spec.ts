import type Stripe from 'stripe';
import { RecordPaymentCommand } from '../ledger/application/commands/record-payment.command.js';
import { RecordRefundCommand } from '../ledger/application/commands/record-refund.command.js';
import { ChangeMembershipCommand } from '../memberships/application/commands/change-membership.command.js';
import { MembershipPlan } from '../memberships/domain/values/membership-plan.js';
import { InvalidStripeEvent } from './invalid-stripe-event.js';
import type { PriceCatalog } from './price-catalog.js';
import type { ProviderCustomers } from './provider-customers.js';
import { StripeEventTranslator } from './stripe-event.translator.js';

const metadata = { member_id: 'ada@example.com', membership_plan: 'MONTHLY' };
const prices = { planOf: async (price: string | { lookup_key: string | null }) => (price === 'price_yearly' ? MembershipPlan.Yearly : undefined) };
const customers = { memberOf: async (customer: string) => (customer === 'cus_ada' ? 'ada@example.com' : undefined) };
const translator = new StripeEventTranslator(prices as unknown as PriceCatalog, customers as unknown as ProviderCustomers);

const event = (type: string, object: unknown, previous?: unknown) =>
  ({ id: 'evt_1', type, created: 1_793_000_000, data: { object, ...(previous ? { previous_attributes: previous } : {}) } }) as unknown as Stripe.Event;

const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'in_1',
  customer: 'cus_ada',
  amount_paid: 999,
  currency: 'eur',
  created: 1_793_000_000,
  status_transitions: { paid_at: 1_793_000_100 },
  parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1', metadata } },
  lines: { data: [{ period: { start: 1_793_000_000, end: 1_795_600_000 }, pricing: { price_details: { price: 'price_monthly' } } }] },
  ...overrides,
});

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  metadata,
  cancel_at_period_end: false,
  cancel_at: null,
  items: { data: [{ price: { id: 'price_monthly', lookup_key: 'membership-monthly' } }] },
  ...overrides,
});

describe('StripeEventTranslator', () => {
  it("translates invoice.paid into Record Payment: the amount in exact money, paid through the lines' end", async () => {
    const translation = await translator.translate(event('invoice.paid', invoice()));

    const [command] = translation.commands as RecordPaymentCommand[];
    expect(command).toBeInstanceOf(RecordPaymentCommand);
    expect(command.amount.toString()).toBe('9.99 EUR');
    expect(command.memberId.value).toBe('ada@example.com');
    expect(command.providerReference.value).toBe('in_1');
    expect(command.paidFor.paidThrough).toEqual(new Date(1_795_600_000 * 1000));
    expect(command.paidFor.membershipReference.value).toBe('sub_1');
    expect(command.messageId).toBe('evt_1');
    expect(translation).toMatchObject({ customer: { memberId: 'ada@example.com', customerReference: 'cus_ada' } });
  });

  it("takes the plan from the line's price, so a switched plan isn't the subscription's stale metadata", async () => {
    const lines = { data: [{ period: { start: 1, end: 2 }, pricing: { price_details: { price: 'price_yearly' } } }] };

    const [command] = (await translator.translate(event('invoice.paid', invoice({ lines })))).commands as RecordPaymentCommand[];

    expect(command.paidFor.plan).toBe(MembershipPlan.Yearly);
  });

  it("ignores invoices that aren't a membership's", async () => {
    expect(await translator.translate(event('invoice.paid', invoice({ parent: null })))).toMatchObject({ commands: [], ignored: expect.any(String) });
  });

  it('refuses a currency the platform takes no payments in: retrying would not help', async () => {
    await expect(translator.translate(event('invoice.paid', invoice({ currency: 'jpy' })))).rejects.toThrow(InvalidStripeEvent);
  });

  it('translates charge.refunded into Record Refund of what this event refunded', async () => {
    const charge = { id: 'ch_1', customer: 'cus_ada', currency: 'eur', amount_refunded: 799 };

    const [command] = (await translator.translate(event('charge.refunded', charge, { amount_refunded: 300 }))).commands as RecordRefundCommand[];

    expect(command).toBeInstanceOf(RecordRefundCommand);
    expect(command.amount.toString()).toBe('4.99 EUR');
    expect(command.providerReference.value).toBe('ch_1:799');
  });

  it("ignores a refund of a customer whose payments Billing never recorded", async () => {
    const charge = { id: 'ch_2', customer: 'cus_other', currency: 'eur', amount_refunded: 100 };

    expect((await translator.translate(event('charge.refunded', charge))).commands).toEqual([]);
  });

  it('translates renewal turned off and on into Cancel and Resume', async () => {
    const cancelled = await translator.translate(event('customer.subscription.updated', subscription({ cancel_at_period_end: true }), { cancel_at_period_end: false }));
    const resumed = await translator.translate(event('customer.subscription.updated', subscription(), { cancel_at_period_end: true }));

    expect((cancelled.commands[0] as ChangeMembershipCommand).change).toEqual({ kind: 'cancel' });
    expect((resumed.commands[0] as ChangeMembershipCommand).change).toEqual({ kind: 'resume' });
  });

  it("translates a new price into Switch Plan, from the items' lookup keys", async () => {
    const yearly = subscription({ items: { data: [{ price: { id: 'price_yearly', lookup_key: 'membership-yearly' } }] } });
    const previous = { items: { data: [{ price: { id: 'price_monthly', lookup_key: 'membership-monthly' } }] } };

    const [command] = (await translator.translate(event('customer.subscription.updated', yearly, previous))).commands as ChangeMembershipCommand[];

    expect(command.change).toEqual({ kind: 'switch-plan', plan: MembershipPlan.Yearly });
    expect(command.providerReference.value).toBe('sub_1');
  });

  it('gives each change of one event its own message id, so the inbox applies each once', async () => {
    const yearly = subscription({ cancel_at_period_end: true, items: { data: [{ price: { id: 'price_yearly', lookup_key: 'membership-yearly' } }] } });
    const previous = { cancel_at_period_end: false, items: { data: [{ price: { id: 'price_monthly', lookup_key: 'membership-monthly' } }] } };

    const commands = (await translator.translate(event('customer.subscription.updated', yearly, previous))).commands as ChangeMembershipCommand[];

    expect(commands.map((command) => command.messageId)).toEqual(['evt_1', 'evt_1:cancel']);
  });

  it('ignores updates that change nothing Billing keeps: the status when the first payment goes through', async () => {
    expect((await translator.translate(event('customer.subscription.updated', subscription(), { status: 'incomplete' }))).commands).toEqual([]);
  });

  it('translates customer.subscription.deleted into End', async () => {
    const [command] = (await translator.translate(event('customer.subscription.deleted', subscription()))).commands as ChangeMembershipCommand[];

    expect(command.change).toEqual({ kind: 'end' });
  });

  it("ignores the events Billing doesn't listen to", async () => {
    expect(await translator.translate(event('customer.created', { id: 'cus_1' }))).toMatchObject({ commands: [] });
  });
});
