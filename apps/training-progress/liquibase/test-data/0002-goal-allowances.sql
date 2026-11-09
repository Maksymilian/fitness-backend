--liquibase formatted sql

--changeset training-progress:test-data-0002-goal-allowances context:test-data
--comment: Ada has a membership in Billing (its test-data/0001), so she may hold any number of active goals; Grace has none, so one.
INSERT INTO goal_allowances (member_id, unlimited, source_revision, changed_at, version) VALUES
  ('ada@example.com', true, 1, '2026-10-01T07:00:02Z', 1);
--rollback DELETE FROM goal_allowances WHERE member_id = 'ada@example.com';
