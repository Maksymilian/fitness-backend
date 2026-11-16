import { ConcurrencyConflict, type Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { drizzleTransaction } from '../../../platform/database/database.js';
import { loggedWorkouts } from '../../../platform/database/schema.js';
import { MemberId } from '../../members/domain/values/member-id.js';
import { LoggedWorkout } from '../domain/logged-workout.js';
import { LoggedWorkoutRepository } from '../domain/logged-workout.repository.js';
import { Discipline } from '../domain/values/discipline.js';
import { LoggedWorkoutId } from '../domain/values/logged-workout-id.js';
import { SourceRevision } from '../domain/values/source-revision.js';
import { WorkoutMetrics } from '../domain/values/workout-metrics.js';

type LoggedWorkoutRow = typeof loggedWorkouts.$inferSelect;

/** Stores logged workouts in PostgreSQL with Drizzle, with optimistic locking on `source_revision`: the upstream revision it holds. */
@Injectable()
export class DrizzleLoggedWorkoutRepository extends LoggedWorkoutRepository {
  async find(transaction: Transaction, id: LoggedWorkoutId): Promise<LoggedWorkout | undefined> {
    const [row] = await drizzleTransaction(transaction).select().from(loggedWorkouts).where(eq(loggedWorkouts.id, id.value)).for('update');
    return row && toLoggedWorkout(row);
  }

  async save(transaction: Transaction, loggedWorkout: LoggedWorkout): Promise<void> {
    const tx = drizzleTransaction(transaction);
    const p = loggedWorkout.props;
    const changing = {
      durationSeconds: p.metrics.duration.seconds,
      distanceMeters: p.metrics.distance.meters,
      calories: p.metrics.calories.kilocalories,
      counts: p.counts,
      sourceRevision: p.sourceRevision.value,
    };
    if (loggedWorkout.version === 0) {
      await tx.insert(loggedWorkouts).values({
        id: p.id.value,
        memberId: p.memberId.value,
        discipline: p.discipline.value,
        startedAt: p.startedAt,
        loggedAt: p.loggedAt,
        ...changing,
      });
      return;
    }
    const updated = await tx
      .update(loggedWorkouts)
      .set(changing)
      .where(and(eq(loggedWorkouts.id, p.id.value), eq(loggedWorkouts.sourceRevision, loggedWorkout.version)))
      .returning({ id: loggedWorkouts.id });
    if (updated.length === 0) {
      throw new ConcurrencyConflict('LoggedWorkout', p.id.value);
    }
  }
}

function toLoggedWorkout(row: LoggedWorkoutRow): LoggedWorkout {
  return LoggedWorkout.reconstitute({
    id: LoggedWorkoutId.from(row.id),
    memberId: MemberId.from(row.memberId),
    discipline: Discipline.from(row.discipline),
    startedAt: row.startedAt,
    metrics: WorkoutMetrics.of(row),
    counts: row.counts,
    sourceRevision: SourceRevision.of(row.sourceRevision),
    loggedAt: row.loggedAt,
  });
}
