import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { loggedWorkouts, personalRecords } from '../../../platform/database/schema.js';
import { PersonalRecordQueries } from '../application/queries/personal-record-queries.js';
import type { PersonalRecordRepresentation } from '../application/personal-record.representation.interface.js';

/** Reads personal records with SQL, bypassing the domain model. */
@Injectable()
export class DrizzlePersonalRecordQueries extends PersonalRecordQueries {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async ofMember(memberId: string): Promise<PersonalRecordRepresentation[]> {
    const rows = await this.db.select().from(personalRecords).where(eq(personalRecords.memberId, memberId));
    const records = rows.flatMap((row) =>
      [
        { metric: 'LONGEST_DISTANCE', value: row.longestDistanceMeters, loggedWorkoutId: row.longestDistanceLoggedWorkoutId, setAt: row.longestDistanceSetAt },
        { metric: 'LONGEST_DURATION', value: row.longestDurationSeconds, loggedWorkoutId: row.longestDurationLoggedWorkoutId, setAt: row.longestDurationSetAt },
        { metric: 'MOST_CALORIES', value: row.mostCalories, loggedWorkoutId: row.mostCaloriesLoggedWorkoutId, setAt: row.mostCaloriesSetAt },
      ].flatMap(({ metric, value, loggedWorkoutId, setAt }) =>
        value === null || loggedWorkoutId === null || setAt === null ? [] : [{ discipline: row.discipline, metric, value, loggedWorkoutId, setAt }],
      ),
    );
    if (records.length === 0) {
      return [];
    }
    const workouts = await this.db
      .select()
      .from(loggedWorkouts)
      .where(inArray(loggedWorkouts.id, [...new Set(records.map((record) => record.loggedWorkoutId))]));
    const byId = new Map(workouts.map((workout) => [workout.id, workout]));
    return records.flatMap(({ loggedWorkoutId, ...record }) => {
      const workout = byId.get(loggedWorkoutId);
      return workout
        ? [
            {
              ...record,
              loggedWorkout: {
                id: workout.id,
                discipline: workout.discipline,
                startedAt: workout.startedAt,
                durationSeconds: workout.durationSeconds,
                distanceMeters: workout.distanceMeters,
                calories: workout.calories,
              },
            },
          ]
        : [];
    });
  }
}
