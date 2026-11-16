import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, count, eq, gte, lt, sql, sum } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { loggedWorkouts } from '../../../platform/database/schema.js';
import type { TrainingPeriod } from '../../calendar/domain/values/training-period.js';
import { ProgressSummaries } from '../application/queries/progress-summaries.js';
import type { ProgressSummaryRepresentation } from '../application/progress-summary.representation.interface.js';

/** Sums the training log into progress summaries and active days with SQL. */
@Injectable()
export class DrizzleProgressSummaries extends ProgressSummaries {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async summary(memberId: string, period: TrainingPeriod, discipline: string | null): Promise<ProgressSummaryRepresentation> {
    const [totals] = await this.db
      .select({
        workoutCount: count(),
        totalDurationSeconds: sum(loggedWorkouts.durationSeconds),
        totalDistanceMeters: sum(loggedWorkouts.distanceMeters),
        totalCalories: sum(loggedWorkouts.calories),
      })
      .from(loggedWorkouts)
      .where(
        and(
          eq(loggedWorkouts.memberId, memberId),
          eq(loggedWorkouts.counts, true),
          gte(loggedWorkouts.startedAt, period.start),
          lt(loggedWorkouts.startedAt, period.end),
          discipline ? eq(loggedWorkouts.discipline, discipline) : undefined,
        ),
      );
    return {
      period: period.kind,
      periodStart: period.start,
      periodEnd: period.end,
      discipline,
      workoutCount: Number(totals?.workoutCount ?? 0),
      totalDurationSeconds: Number(totals?.totalDurationSeconds ?? 0),
      totalDistanceMeters: Number(totals?.totalDistanceMeters ?? 0),
      totalCalories: Number(totals?.totalCalories ?? 0),
    };
  }

  async activeDays(memberId: string): Promise<Date[]> {
    const day = sql<string>`to_char(${loggedWorkouts.startedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const rows = await this.db
      .selectDistinct({ day })
      .from(loggedWorkouts)
      .where(and(eq(loggedWorkouts.memberId, memberId), eq(loggedWorkouts.counts, true)))
      .orderBy(sql`1 desc`);
    return rows.map((row) => new Date(`${row.day}T00:00:00Z`));
  }
}
