--liquibase formatted sql

--changeset billing:0001-billing-tables
--comment: One row per Membership aggregate (one per member), one per LedgerEntry aggregate (never changed, so no version), and the anticorruption layer's map from a member to their Stripe customer. Amounts are NUMERIC(10,2): exact, two decimal places, below 100,000,000.
CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  member_id text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('MONTHLY', 'YEARLY')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'ENDED')),
  paid_through timestamp with time zone NOT NULL,
  renews boolean NOT NULL,
  provider_reference text NOT NULL,
  started_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone,
  revision integer NOT NULL,
  CONSTRAINT memberships_member_unique UNIQUE (member_id)
);
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY,
  member_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('PAYMENT', 'REFUND')),
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  provider_reference text NOT NULL,
  plan text CHECK (plan IN ('MONTHLY', 'YEARLY')),
  paid_through timestamp with time zone,
  membership_reference text,
  recorded_at timestamp with time zone NOT NULL,
  CONSTRAINT ledger_entries_provider_reference_unique UNIQUE (kind, provider_reference)
);
CREATE INDEX ledger_entries_member_occurred_at_idx ON ledger_entries (member_id, occurred_at DESC, id DESC);
CREATE TABLE provider_customers (
  member_id text PRIMARY KEY,
  customer_reference text NOT NULL,
  recorded_at timestamp with time zone NOT NULL,
  CONSTRAINT provider_customers_customer_unique UNIQUE (customer_reference)
);
--rollback DROP TABLE provider_customers;
--rollback DROP INDEX ledger_entries_member_occurred_at_idx;
--rollback DROP TABLE ledger_entries;
--rollback DROP TABLE memberships;
