# 2. Billing becomes a supporting subdomain, its own service, over Stripe

- **Status:** Accepted
- **Date:** 2026-10-30
- **Related:** `docs/architecture.md` sections 2, 7.6 and 18, `docs/ubiquitous-language.md` (Billing context, Goal Allowance)

## Context

The architecture classified **Billing & Subscriptions** as a generic subdomain: buy it (Stripe), build no model, put a library behind a port. Members now pay for a membership, and we want to keep what they paid in our own records: our own model of memberships, a ledger of payments and refunds, and amounts as exact decimals. With that, Billing holds rules that are ours:

- a member has one membership at a time, which starts with a payment, renews, can be cancelled and resumed, and ends;
- what was paid and refunded is recorded once, never changed, and amounts never go through floating point;
- Stripe's objects (customers, subscriptions, invoices, charges) must not shape the rest of the platform, so Stripe can be replaced, or reconciled against, without touching other contexts.

## Decision

1. **Billing is a supporting subdomain.** It gets the lean tactical toolset (as Workout Tracking): two small aggregates, `Membership` (one per member) and `LedgerEntry` (one per payment or refund, never changed), value objects (`Money` on `decimal.js`, `Currency`, `MembershipPlan`, `ProviderReference`), and one policy, *Apply Payment*.
2. **Its own service and database**, as the rules require for a core or supporting context: `apps/billing`, PostgreSQL instance 3, Liquibase changesets, its own outbox. It never reads another service's database and is never called synchronously by another service.
3. **Stripe stays behind an anticorruption layer** (`billing/stripe-acl/`), both ways:
   - *in*: Stripe's webhook events, verified by `@nestjs/webhooks` (`scheme: 'stripe'`), deduplicated with the inbox in the transaction of the change (`processInTransaction`), translated into Billing's commands (`invoice.paid` → Record Payment, `charge.refunded` → Record Refund, `customer.subscription.updated` → Cancel, Resume or Switch Plan, `customer.subscription.deleted` → End);
   - *out*: the `PaymentProvider` port (start a Checkout, open the Billing Portal), implemented with the official `stripe` SDK. Members pay only on Stripe's hosted pages: no card data reaches the platform.
4. **Money is `decimal.js` in the domain and `NUMERIC(10,2)` in PostgreSQL**, with a `char(3)` currency. Only currencies with two minor units are accepted, so every amount fits the column exactly; Stripe's integer minor units are converted in the value object.
5. **Communication with the other services is one-way and asynchronous:** Billing publishes integration events in its published language (`libs/billing-contracts`: `membership-started.v1`, `membership-ended.v1`), through its outbox, as CloudEvents to the `billing.integration` exchange on RabbitMQ. Training Progress consumes them in its anticorruption layer (`billing-acl/`) and translates them into its own concept, the **Goal Allowance**: one active training goal without a membership, any number with one. Workout Tracking doesn't need Billing. Nothing calls Billing synchronously, and Billing calls nothing but Stripe.
6. **Development runs on Stripe's test mode:** a sandbox's test keys, the catalog created by `scripts/stripe/seed-catalog.mjs` (fixed lookup keys), and the Stripe CLI in Compose (profile `stripe`) forwarding webhooks to the local service. The tests and load tests never call Stripe: they sign Stripe-like events with `@nestjs/webhooks/testing` and replace the `PaymentProvider`.

## Defaults chosen

- Plans: **Monthly 9.99 EUR**, **Yearly 99.90 EUR** (in the seeded catalog; prices are Stripe's, not the model's).
- A cancelled membership stays active until it's paid through; a failed renewal keeps it active while Stripe retries, and it ends when Stripe gives up.
- A lapsed membership turns off **unlimited training goals**: back to one active goal. Goals already set are kept.

## Consequences

- A third database, service, set of changesets, dashboard row and Postman collection to keep, and the stress and spike tests to run after this change (CLAUDE.md).
- Billing's state is eventually consistent with Stripe's: a membership changes after its webhook is processed, and a goal allowance after Billing's event reaches Training Progress (seconds).
- Two goals set at the same moment by a member without a membership can both pass the allowance check (the count is read, not locked). Accepted: the member gains one goal, nothing is lost.
- Stripe's webhook events can arrive in any order; Billing handles it with state guards (each method changes nothing when it doesn't apply) and Stripe's retries (a cancellation for a membership not started yet is refused, and retried). With the Stripe CLI nothing is retried: `stripe events resend <id>`.
- Stripe's SDK pins its API version (`2026-09-30.endive` with `stripe` 23.0.0); upgrading it means re-checking the translator against the new version.

## Alternatives considered

- **Keep Billing generic, Stripe as the only record.** Simplest, but our records of payments would be whatever Stripe's API answers, in Stripe's terms, in every consumer.
- **A Billing module inside Training Progress.** Breaks "one service and database per supporting context", and puts money data and Stripe's keys in the core service.
- **Our own payment pages (Stripe Elements).** More control, but card data near our services and more compliance work for nothing members need now.
- **Floats or integer cents in the domain.** Floats round wrongly; integer cents work but leak the minor-unit detail everywhere. `decimal.js` keeps amounts exact and readable, and `NUMERIC(10,2)` stores them exactly.
