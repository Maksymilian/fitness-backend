import { ConcurrencyConflict, type Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { drizzleTransaction } from '../../../platform/database/database.js';
import { personalRecords } from '../../../platform/database/schema.js';
import type { MemberId } from '../../members/domain/values/member-id.js';
import type { Discipline } from '../../training-log/domain/values/discipline.js';
import { LoggedWorkoutId } from '../../training-log/domain/values/logged-workout-id.js';
import { PersonalRecords } from '../domain/personal-records.js';
import { PersonalRecordsRepository } from '../domain/personal-records.repository.js';
import { PersonalRecord } from '../domain/values/personal-record.js';
import { RecordMetric } from '../domain/values/record-metric.js';

type PersonalRecordsRow = typeof personalRecords.$inferSelect;

/** One row per aggregate: three columns (value, logged workout, set at) per record metric. */
const COLUMNS = {
  LONGEST_DISTANCE: ['longestDistanceMeters', 'longestDistanceLoggedWorkoutId', 'longestDistanceSetAt'],
  LONGEST_DURATION: ['longestDurationSeconds', 'longestDurationLoggedWorkoutId', 'longestDurationSetAt'],
  MOST_CALORIES: ['mostCalories', 'mostCaloriesLoggedWorkoutId', 'mostCaloriesSetAt'],
} as const;

/** Stores a member's personal records per discipline in PostgreSQL with Drizzle, with optimistic locking on `version`. */
@Injectable()
export class DrizzlePersonalRecordsRepository extends PersonalRecordsRepository {
  async find(transaction: Transaction, memberId: MemberId, discipline: Discipline): Promise<PersonalRecords | undefined> {
    const [row] = await drizzleTransaction(transaction)
      .select()
      .from(personalRecords)
      .where(and(eq(personalRecords.memberId, memberId.value), eq(personalRecords.discipline, discipline.value)))
      .for('update');
    return row && PersonalRecords.reconstitute(memberId, discipline, toRecords(row), row.version);
  }

  async save(transaction: Transaction, aggregate: PersonalRecords): Promise<void> {
    const tx = drizzleTransaction(transaction);
    const columns: Record<string, unknown> = { version: aggregate.version + 1 };
    for (const metric of RecordMetric.all) {
      const [value, loggedWorkoutId, setAt] = COLUMNS[metric.value];
      const record = aggregate.recordOf(metric);
      columns[value] = record?.value ?? null;
      columns[loggedWorkoutId] = record?.loggedWorkoutId.value ?? null;
      columns[setAt] = record?.setAt ?? null;
    }
    if (aggregate.version === 0) {
      await tx.insert(personalRecords).values({
        memberId: aggregate.memberId.value,
        discipline: aggregate.discipline.value,
        ...columns,
      } as typeof personalRecords.$inferInsert);
      return;
    }
    const updated = await tx
      .update(personalRecords)
      .set(columns)
      .where(
        and(
          eq(personalRecords.memberId, aggregate.memberId.value),
          eq(personalRecords.discipline, aggregate.discipline.value),
          eq(personalRecords.version, aggregate.version),
        ),
      )
      .returning({ memberId: personalRecords.memberId });
    if (updated.length === 0) {
      throw new ConcurrencyConflict('PersonalRecords', `${aggregate.memberId.value}/${aggregate.discipline.value}`);
    }
  }
}

function toRecords(row: PersonalRecordsRow): PersonalRecord[] {
  return RecordMetric.all.flatMap((metric) => {
    const [value, loggedWorkoutId, setAt] = COLUMNS[metric.value];
    const recordValue = row[value];
    const holder = row[loggedWorkoutId];
    const at = row[setAt];
    return recordValue === null || holder === null || at === null ? [] : [new PersonalRecord(metric, recordValue, LoggedWorkoutId.from(holder), at)];
  });
}
