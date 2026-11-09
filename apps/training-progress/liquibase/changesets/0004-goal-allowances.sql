--liquibase formatted sql

--changeset training-progress:0004-goal-allowances
--comment: One row per GoalAllowance aggregate: whether the member may hold any number of active training goals (they have a membership in Billing) and the membership's revision there. No row means one active goal.
CREATE TABLE goal_allowances (
  member_id text PRIMARY KEY,
  unlimited boolean NOT NULL,
  source_revision integer NOT NULL,
  changed_at timestamp with time zone NOT NULL,
  version integer NOT NULL
);
--rollback DROP TABLE goal_allowances;
