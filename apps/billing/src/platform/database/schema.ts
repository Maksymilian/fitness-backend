import { boolean, char, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/** One row per `Membership` aggregate: one per member. `revision` is also its optimistic-lock version. */
export const memberships = pgTable('memberships', {
  id: uuid().primaryKey(),
  memberId: text('member_id').notNull().unique('memberships_member_unique'),
  plan: text().notNull(),
  status: text().notNull(),
  paidThrough: timestamp('paid_through', { withTimezone: true }).notNull(),
  renews: boolean().notNull(),
  providerReference: text('provider_reference').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  revision: integer().notNull(),
});

/**
 * One row per `LedgerEntry` aggregate, never changed. `amount` is NUMERIC(10,2), read and written
 * as a string, so it never goes through a float.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid().primaryKey(),
    memberId: text('member_id').notNull(),
    kind: text().notNull(),
    amount: numeric({ precision: 10, scale: 2 }).notNull(),
    currency: char({ length: 3 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    providerReference: text('provider_reference').notNull(),
    plan: text(),
    paidThrough: timestamp('paid_through', { withTimezone: true }),
    membershipReference: text('membership_reference'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('ledger_entries_provider_reference_unique').on(table.kind, table.providerReference),
    index('ledger_entries_member_occurred_at_idx').on(table.memberId, table.occurredAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
  ],
);

/** The anticorruption layer's map from a member to the payment provider's customer (Stripe's `cus_...`). */
export const providerCustomers = pgTable('provider_customers', {
  memberId: text('member_id').primaryKey(),
  customerReference: text('customer_reference').notNull().unique('provider_customers_customer_unique'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
});
