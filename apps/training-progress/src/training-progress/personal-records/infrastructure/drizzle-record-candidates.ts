import type { Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { drizzleTransaction } from '../../../platform/database/database.js';
import { loggedWorkouts } from '../../../platform/database/schema.js';
import type { MemberId } from '../../members/domain/values/member-id.js';
import type { Discipline } from '../../training-log/domain/values/discipline.js';
import { LoggedWorkoutId } from '../../training-log/domain/values/logged-workout-id.js';
import { RecordCandidates } from '../application/record-candidates.js';
import { RecordCandidate } from '../domain/values/record-candidate.js';
import { RecordMetric } from '../domain/values/record-metric.js';

const VALUE_COLUMN = {
  LONGEST_DISTANCE: loggedWorkouts.distanceMeters,
  LONGEST_DURATION: loggedWorkouts.durationSeconds,
  MOST_CALORIES: loggedWorkouts.calories,
} as const;

/** Finds, with SQL over the training log, the counting workouts that could hold each personal record. */
@Injectable()
export class DrizzleRecordCandidates extends RecordCandidates {
  async best(transaction: Transaction, memberId: MemberId, discipline: Discipline, currentHolders: readonly LoggedWorkoutId[]): Promise<RecordCandidate[]> {
    const tx = drizzleTransaction(transaction);
    const holders = currentHolders.map((id) => id.value);
    const candidates: RecordCandidate[] = [];
    // One metric after the other: a transaction runs one statement at a time.
    for (const metric of RecordMetric.all) {
      const column = VALUE_COLUMN[metric.value];
      const [best] = await tx
        .select({ id: loggedWorkouts.id, value: column, startedAt: loggedWorkouts.startedAt })
        .from(loggedWorkouts)
        .where(and(eq(loggedWorkouts.memberId, memberId.value), eq(loggedWorkouts.discipline, discipline.value), eq(loggedWorkouts.counts, true)))
        .orderBy(
          desc(column),
          holders.length > 0 ? desc(sql`${inArray(loggedWorkouts.id, holders)}`) : sql`1`,
          asc(loggedWorkouts.startedAt),
          asc(loggedWorkouts.id),
        )
        .limit(1);
      if (best) {
        candidates.push(new RecordCandidate(metric, best.value, LoggedWorkoutId.from(best.id), best.startedAt));
      }
    }
    return candidates;
  }
}
