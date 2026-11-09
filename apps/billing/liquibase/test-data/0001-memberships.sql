--liquibase formatted sql

--changeset billing:test-data-0001-memberships context:test-data
--comment: Ada has a monthly membership, paid once, for local testing and the Postman collection; Grace has none. The Stripe references are made up: Stripe's test mode doesn't know them.
INSERT INTO memberships (id, member_id, plan, status, paid_through, renews, provider_reference, started_at, revision) VALUES
  ('0199c3a2-0000-7000-8000-000000000301', 'ada@example.com', 'MONTHLY', 'ACTIVE', '2027-12-01T00:00:00Z', true, 'sub_test_ada', '2026-10-01T07:00:00Z', 1);
INSERT INTO ledger_entries (id, member_id, kind, amount, currency, occurred_at, provider_reference, plan, paid_through, membership_reference, recorded_at) VALUES
  ('0199c3a2-0000-7000-8000-000000000302', 'ada@example.com', 'PAYMENT', 9.99, 'EUR', '2026-10-01T07:00:00Z', 'in_test_ada_1', 'MONTHLY', '2027-12-01T00:00:00Z', 'sub_test_ada', '2026-10-01T07:00:01Z');
INSERT INTO provider_customers (member_id, customer_reference, recorded_at) VALUES
  ('ada@example.com', 'cus_test_ada', '2026-10-01T07:00:01Z');
--rollback DELETE FROM provider_customers WHERE member_id = 'ada@example.com';
--rollback DELETE FROM ledger_entries WHERE id = '0199c3a2-0000-7000-8000-000000000302';
--rollback DELETE FROM memberships WHERE id = '0199c3a2-0000-7000-8000-000000000301';
