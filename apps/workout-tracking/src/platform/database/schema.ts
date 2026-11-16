import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/** One row per `Equipment` aggregate. */
export const equipment = pgTable('equipment', {
  id: uuid().primaryKey(),
  serialNumber: text('serial_number').notNull().unique('equipment_serial_number_unique'),
  type: text().notNull(),
  pairedMemberId: text('paired_member_id'),
  pairedAt: timestamp('paired_at', { withTimezone: true }),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull(),
  version: integer().notNull(),
});

/** One row per `Workout` aggregate. `revision` is also its optimistic-lock version. */
export const workouts = pgTable(
  'workouts',
  {
    id: uuid().primaryKey(),
    equipmentId: uuid('equipment_id').notNull(),
    equipmentType: text('equipment_type').notNull(),
    recordingId: text('recording_id').notNull(),
    memberId: text('member_id').notNull(),
    discipline: text().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    distanceMeters: integer('distance_meters').notNull(),
    calories: integer().notNull(),
    status: text().notNull(),
    revision: integer().notNull(),
    voidReason: text('void_reason'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('workouts_equipment_recording_unique').on(table.equipmentId, table.recordingId),
    index('workouts_member_started_at_idx').on(table.memberId, table.startedAt.desc().nullsFirst(), table.id.desc().nullsFirst()),
  ],
);

/** The audit trail of corrections: one row per correction, never changed. */
export const workoutCorrections = pgTable(
  'workout_corrections',
  {
    workoutId: uuid('workout_id').notNull(),
    revision: integer().notNull(),
    previousMetrics: jsonb('previous_metrics').notNull(),
    newMetrics: jsonb('new_metrics').notNull(),
    reason: text().notNull(),
    correctedAt: timestamp('corrected_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [primaryKey({ columns: [table.workoutId, table.revision] })],
);
