import { ConcurrencyConflict, type Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, lte, sql } from 'drizzle-orm';
import { type Database, drizzleTransaction } from '../../../platform/database/database.js';
import { trainingGoals } from '../../../platform/database/schema.js';
import { MemberId } from '../../members/domain/values/member-id.js';
import { Discipline } from '../../training-log/domain/values/discipline.js';
import { TrainingGoalNotFound } from '../domain/errors/training-goal-not-found.js';
import { TrainingGoal } from '../domain/training-goal.js';
import { TrainingGoalRepository } from '../domain/training-goal.repository.js';
import { GoalMetric } from '../domain/values/goal-metric.js';
import { GoalPeriod } from '../domain/values/goal-period.js';
import { GoalStatus } from '../domain/values/goal-status.js';
import { GoalTarget } from '../domain/values/goal-target.js';
import { TrainingGoalId } from '../domain/values/training-goal-id.js';

type TrainingGoalRow = typeof trainingGoals.$inferSelect;

@Injectable()
export class DrizzleTrainingGoalRepository extends TrainingGoalRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async get(id: TrainingGoalId): Promise<TrainingGoal> {
    const [row] = await this.db.select().from(trainingGoals).where(eq(trainingGoals.id, id.value));
    if (!row) {
      throw new TrainingGoalNotFound(id.value);
    }
    return toTrainingGoal(row);
  }

  async activeGoalsOf(memberId: MemberId): Promise<TrainingGoal[]> {
    const rows = await this.db
      .select()
      .from(trainingGoals)
      .where(and(eq(trainingGoals.memberId, memberId.value), eq(trainingGoals.status, GoalStatus.Active.value)));
    return rows.map(toTrainingGoal);
  }

  async activeGoalsPastGracePeriod(now: Date): Promise<TrainingGoal[]> {
    const rows = await this.db
      .select()
      .from(trainingGoals)
      .where(and(eq(trainingGoals.status, GoalStatus.Active.value), lte(sql`${trainingGoals.endsOn} + interval '1 day'`, now)));
    return rows.map(toTrainingGoal);
  }

  async save(transaction: Transaction, goal: TrainingGoal): Promise<void> {
    const tx = drizzleTransaction(transaction);
    const p = goal.props;
    const changing = {
      status: p.status.value,
      achievedAt: p.achievedAt,
      missedAt: p.missedAt,
      abandonedAt: p.abandonedAt,
      version: goal.version + 1,
    };
    if (goal.version === 0) {
      await tx.insert(trainingGoals).values({
        id: p.id.value,
        memberId: p.memberId.value,
        metric: p.metric.value,
        target: p.target.value,
        discipline: p.discipline?.value ?? null,
        startsOn: p.period.startsOn,
        endsOn: p.period.endsOn,
        setAt: p.setAt,
        ...changing,
      });
      return;
    }
    const updated = await tx
      .update(trainingGoals)
      .set(changing)
      .where(and(eq(trainingGoals.id, p.id.value), eq(trainingGoals.version, goal.version)))
      .returning({ id: trainingGoals.id });
    if (updated.length === 0) {
      throw new ConcurrencyConflict('TrainingGoal', p.id.value);
    }
  }
}

function toTrainingGoal(row: TrainingGoalRow): TrainingGoal {
  return TrainingGoal.reconstitute(
    {
      id: TrainingGoalId.from(row.id),
      memberId: MemberId.from(row.memberId),
      metric: GoalMetric.from(row.metric),
      target: GoalTarget.of(row.target),
      discipline: row.discipline === null ? null : Discipline.from(row.discipline),
      period: GoalPeriod.reconstitute(row.startsOn, row.endsOn),
      status: GoalStatus.from(row.status),
      setAt: row.setAt,
      achievedAt: row.achievedAt,
      missedAt: row.missedAt,
      abandonedAt: row.abandonedAt,
    },
    row.version,
  );
}
