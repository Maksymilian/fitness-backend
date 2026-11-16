import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, gte } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { trainingGoals } from '../../../platform/database/schema.js';
import { TrainingGoalQueries } from '../application/queries/training-goal-queries.js';
import type { TrainingGoalRepresentation } from '../application/training-goal.representation.interface.js';

/** Reads training goals with SQL, bypassing the domain model. */
@Injectable()
export class DrizzleTrainingGoalQueries extends TrainingGoalQueries {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  /** The (member_id, status) index finds the member's goals; set_at is then checked on those few rows. */
  async ofMember(memberId: string, status: string | null, setSince: Date | null): Promise<TrainingGoalRepresentation[]> {
    const rows = await this.db
      .select()
      .from(trainingGoals)
      .where(
        and(
          eq(trainingGoals.memberId, memberId),
          status ? eq(trainingGoals.status, status) : undefined,
          setSince ? gte(trainingGoals.setAt, setSince) : undefined,
        ),
      )
      .orderBy(asc(trainingGoals.startsOn), asc(trainingGoals.id));
    return rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      metric: row.metric,
      target: row.target,
      discipline: row.discipline,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      status: row.status,
      achievedAt: row.achievedAt,
    }));
  }
}
