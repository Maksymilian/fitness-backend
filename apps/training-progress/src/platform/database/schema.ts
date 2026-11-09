import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Mirrors the Liquibase changesets in apps/training-progress/liquibase, which own the DDL.

/** One row per `LoggedWorkout` aggregate. `source_revision` is also its optimistic-lock version. */
export const loggedWorkouts = pgTable(
  'logged_workouts',
  {
    id: uuid().primaryKey(),
    memberId: text('member_id').notNull(),
    discipline: text().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    distanceMeters: integer('distance_meters').notNull(),
    calories: integer().notNull(),
    counts: boolean().notNull(),
    sourceRevision: integer('source_revision').notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('logged_workouts_member_started_at_idx')
      .on(table.memberId, table.startedAt.desc().nullsFirst(), table.id.desc().nullsFirst())
      .where(sql`counts`),
  ],
);

/** One row per `PersonalRecords` aggregate (member and discipline), with each record metric's record. */
export const personalRecords = pgTable(
  'personal_records',
  {
    memberId: text('member_id').notNull(),
    discipline: text().notNull(),
    longestDistanceMeters: integer('longest_distance_meters'),
    longestDistanceLoggedWorkoutId: uuid('longest_distance_logged_workout_id'),
    longestDistanceSetAt: timestamp('longest_distance_set_at', { withTimezone: true }),
    longestDurationSeconds: integer('longest_duration_seconds'),
    longestDurationLoggedWorkoutId: uuid('longest_duration_logged_workout_id'),
    longestDurationSetAt: timestamp('longest_duration_set_at', { withTimezone: true }),
    mostCalories: integer('most_calories'),
    mostCaloriesLoggedWorkoutId: uuid('most_calories_logged_workout_id'),
    mostCaloriesSetAt: timestamp('most_calories_set_at', { withTimezone: true }),
    version: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.discipline] })],
);

/** One row per `TrainingGoal` aggregate. */
export const trainingGoals = pgTable(
  'training_goals',
  {
    id: uuid().primaryKey(),
    memberId: text('member_id').notNull(),
    metric: text().notNull(),
    target: integer().notNull(),
    discipline: text(),
    startsOn: timestamp('starts_on', { withTimezone: true }).notNull(),
    endsOn: timestamp('ends_on', { withTimezone: true }).notNull(),
    status: text().notNull(),
    setAt: timestamp('set_at', { withTimezone: true }).notNull(),
    achievedAt: timestamp('achieved_at', { withTimezone: true }),
    missedAt: timestamp('missed_at', { withTimezone: true }),
    abandonedAt: timestamp('abandoned_at', { withTimezone: true }),
    version: integer().notNull(),
  },
  (table) => [index('training_goals_member_status_idx').on(table.memberId, table.status)],
);

/** One row per signed-in Telegram chat. Signing out deletes it. */
export const telegramChats = pgTable('telegram_chats', {
  chatId: bigint('chat_id', { mode: 'number' }).primaryKey(),
  memberId: text('member_id').notNull(),
  signedInAt: timestamp('signed_in_at', { withTimezone: true }).notNull(),
});

/**
 * One row per `GoalAllowance` aggregate whose member Billing told us about. No row: one active goal.
 * `source_revision` is the membership's revision in Billing, against reordering.
 */
export const goalAllowances = pgTable('goal_allowances', {
  memberId: text('member_id').primaryKey(),
  unlimited: boolean().notNull(),
  sourceRevision: integer('source_revision').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  version: integer().notNull(),
});
