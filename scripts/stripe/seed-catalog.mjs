// Creates Billing's catalog in a Stripe sandbox (docs/architecture.md, section 18.6): the membership
// product, its two prices with the lookup keys Billing finds them by, and the Billing Portal's
// configuration (switch between the plans, cancel at the end of the period, card, invoices).
// Running it again changes nothing: prices are found by lookup key, the portal by its metadata.
//
//   pnpm stripe:seed-catalog                     reads STRIPE_SECRET_KEY from apps/billing/.env
//   CURRENCY=pln MONTHLY=3900 YEARLY=39000 pnpm stripe:seed-catalog
//
// Test mode only: it refuses a live key. Amounts are in minor units (999 = 9.99).
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Set STRIPE_SECRET_KEY (a test key, sk_test_...) in apps/billing/.env');
  process.exit(2);
}
if (!/^(sk|rk)_test_/.test(key)) {
  console.error('STRIPE_SECRET_KEY is not a test key: the catalog is only seeded in test mode');
  process.exit(2);
}

const currency = (process.env.CURRENCY ?? 'eur').toLowerCase();
const plans = [
  { lookupKey: 'membership-monthly', plan: 'MONTHLY', interval: 'month', amount: Number(process.env.MONTHLY ?? 999) },
  { lookupKey: 'membership-yearly', plan: 'YEARLY', interval: 'year', amount: Number(process.env.YEARLY ?? 9990) },
];
const stripe = new Stripe(key);

const existing = await stripe.prices.list({ lookup_keys: plans.map((p) => p.lookupKey), active: true, expand: ['data.product'], limit: 10 });
let product = existing.data.map((price) => price.product).find((candidate) => typeof candidate === 'object' && !candidate.deleted);
if (!product) {
  product = await stripe.products.create({ name: 'Fitness platform membership', metadata: { billing: 'membership' } });
  console.log(`Created product ${product.id}`);
}

const prices = {};
for (const { lookupKey, plan, interval, amount } of plans) {
  const found = existing.data.find((price) => price.lookup_key === lookupKey);
  if (found) {
    console.log(`Price ${lookupKey}: ${found.id}, ${found.unit_amount} ${found.currency} a ${found.recurring?.interval} (kept)`);
    prices[plan] = found.id;
    continue;
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: amount,
    recurring: { interval },
    lookup_key: lookupKey,
    metadata: { membership_plan: plan },
  });
  console.log(`Created price ${lookupKey}: ${price.id}, ${amount} ${currency} a ${interval}`);
  prices[plan] = price.id;
}

const portals = await stripe.billingPortal.configurations.list({ limit: 100 });
if (portals.data.some((configuration) => configuration.metadata?.billing === 'membership' && configuration.active)) {
  console.log('Billing Portal configuration: kept');
} else {
  const configuration = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'Your fitness platform membership' },
    default_return_url: 'http://localhost:5173/membership',
    features: {
      customer_update: { enabled: false },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        products: [{ product: product.id, prices: Object.values(prices) }],
        proration_behavior: 'always_invoice',
      },
    },
    metadata: { billing: 'membership' },
  });
  // The default configuration is what billingPortal.sessions.create() uses without one.
  await stripe.billingPortal.configurations.update(configuration.id, { is_default: true }).catch(() => undefined);
  console.log(`Created Billing Portal configuration ${configuration.id}`);
}
console.log('Done. Pay with the test card 4242 4242 4242 4242, any future date and CVC.');
