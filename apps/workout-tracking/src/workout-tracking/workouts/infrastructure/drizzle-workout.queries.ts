import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { workouts } from '../../../platform/database/schema.js';
import { WorkoutQueries } from '../application/queries/workout-queries.js';
import type { WorkoutPage, WorkoutRepresentation } from '../application/workout.representation.interface.js';

type WorkoutRow = typeof workouts.$inferSelect;

/** A position in a member's workouts: the last workout's start and id, as `<ISO start>_<id>`. */
export const WORKOUT_CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f-]{36})$/;

/** Reads workouts with SQL, bypassing the domain model. */
@Injectable()
export class DrizzleWorkoutQueries extends WorkoutQueries {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async byId(workoutId: string): Promise<WorkoutRepresentation | undefined> {
    const [row] = await this.db.select().from(workouts).where(eq(workouts.id, workoutId));
    return row && represent(row);
  }

  async ofMember(memberId: string, limit: number, cursor: string | null): Promise<WorkoutPage> {
    const after = cursor ? WORKOUT_CURSOR.exec(cursor) : null;
    const rows = await this.db
      .select()
      .from(workouts)
      .where(
        and(eq(workouts.memberId, memberId), after ? sql`(${workouts.startedAt}, ${workouts.id}) < (${after[1]}::timestamptz, ${after[2]}::uuid)` : undefined),
      )
      // Served by the (member_id, started_at desc, id desc) index.
      .orderBy(desc(workouts.startedAt), desc(workouts.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      workouts: page.map(represent),
      nextCursor: rows.length > limit && last ? `${last.startedAt.toISOString()}_${last.id}` : null,
    };
  }
}

function represent(row: WorkoutRow): WorkoutRepresentation {
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    equipmentType: row.equipmentType,
    recordingId: row.recordingId,
    memberId: row.memberId,
    discipline: row.discipline,
    startedAt: row.startedAt.toISOString(),
    durationSeconds: row.durationSeconds,
    distanceMeters: row.distanceMeters,
    calories: row.calories,
    status: row.status,
    revision: row.revision,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    recordedAt: row.recordedAt.toISOString(),
  };
}
