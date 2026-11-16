import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { loggedWorkouts } from '../../../platform/database/schema.js';
import type { TrainingLogPage } from '../application/logged-workout.representation.interface.js';
import { TrainingLog } from '../application/queries/training-log.js';

/** `<ISO start>_<id>` of the last workout on a page. */
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f-]{36})$/;

/** Reads pages of the training log with SQL, bypassing the domain model. */
@Injectable()
export class DrizzleTrainingLog extends TrainingLog {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async page(memberId: string, first: number, after: string | null, discipline: string | null): Promise<TrainingLogPage> {
    const position = after ? CURSOR.exec(after) : null;
    const rows = await this.db
      .select()
      .from(loggedWorkouts)
      .where(
        and(
          eq(loggedWorkouts.memberId, memberId),
          eq(loggedWorkouts.counts, true),
          discipline ? eq(loggedWorkouts.discipline, discipline) : undefined,
          position ? sql`(${loggedWorkouts.startedAt}, ${loggedWorkouts.id}) < (${position[1]}::timestamptz, ${position[2]}::uuid)` : undefined,
        ),
      )
      // Served by the partial (member_id, started_at desc, id desc) index on counting workouts.
      .orderBy(desc(loggedWorkouts.startedAt), desc(loggedWorkouts.id))
      .limit(first + 1);
    const edges = rows.slice(0, first).map((row) => ({
      cursor: `${row.startedAt.toISOString()}_${row.id}`,
      node: {
        id: row.id,
        discipline: row.discipline,
        startedAt: row.startedAt,
        durationSeconds: row.durationSeconds,
        distanceMeters: row.distanceMeters,
        calories: row.calories,
      },
    }));
    return { edges, pageInfo: { hasNextPage: rows.length > first, endCursor: edges.at(-1)?.cursor ?? null } };
  }
}
