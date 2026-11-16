import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, count, eq, gte, lt, sum } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { loggedWorkouts } from '../../../platform/database/schema.js';
import type { MemberId } from '../../members/domain/values/member-id.js';
import { TrainingLogTotals } from '../application/training-log-totals.js';
import { GoalProgress } from '../domain/values/goal-progress.js';
import type { GoalProgressCriteria } from '../domain/values/goal-progress-criteria.js';

const TOTAL = {
  DISTANCE: sum(loggedWorkouts.distanceMeters),
  DURATION: sum(loggedWorkouts.durationSeconds),
  CALORIES: sum(loggedWorkouts.calories),
  WORKOUT_COUNT: count(),
} as const;

/** Sums the training log for a goal's progress criteria with SQL. */
@Injectable()
export class DrizzleTrainingLogTotals extends TrainingLogTotals {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async progress(memberId: MemberId, { metric, period, discipline }: GoalProgressCriteria): Promise<GoalProgress> {
    const [row] = await this.db
      .select({ total: TOTAL[metric.value] })
      .from(loggedWorkouts)
      .where(
        and(
          eq(loggedWorkouts.memberId, memberId.value),
          eq(loggedWorkouts.counts, true),
          gte(loggedWorkouts.startedAt, period.startsOn),
          lt(loggedWorkouts.startedAt, period.endsOn),
          discipline ? eq(loggedWorkouts.discipline, discipline.value) : undefined,
        ),
      );
    return GoalProgress.of(Number(row?.total ?? 0));
  }
}
