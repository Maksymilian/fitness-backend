import { ConcurrencyConflict, type Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import { type Database, drizzleTransaction } from '../../../platform/database/database.js';
import { goalAllowances } from '../../../platform/database/schema.js';
import type { MemberId } from '../../members/domain/values/member-id.js';
import { SourceRevision } from '../../training-log/domain/values/source-revision.js';
import { GoalAllowance } from '../domain/goal-allowance.js';
import { GoalAllowanceRepository } from '../domain/goal-allowance.repository.js';

@Injectable()
export class DrizzleGoalAllowanceRepository extends GoalAllowanceRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async get(memberId: MemberId, tx?: Transaction): Promise<GoalAllowance> {
    const reader = tx ? drizzleTransaction(tx) : this.db;
    const [row] = await reader.select().from(goalAllowances).where(eq(goalAllowances.memberId, memberId.value));
    if (!row) {
      return GoalAllowance.of(memberId);
    }
    return GoalAllowance.reconstitute({ memberId, unlimited: row.unlimited, sourceRevision: SourceRevision.of(row.sourceRevision) }, row.version);
  }

  async save(transaction: Transaction, allowance: GoalAllowance): Promise<void> {
    const tx = drizzleTransaction(transaction);
    const { memberId, unlimited, sourceRevision } = allowance.props;
    const values = { unlimited, sourceRevision: sourceRevision?.value ?? 1, changedAt: new Date(), version: allowance.version + 1 };
    if (allowance.version === 0) {
      const inserted = await tx
        .insert(goalAllowances)
        .values({ memberId: memberId.value, ...values })
        .onConflictDoNothing()
        .returning({ memberId: goalAllowances.memberId });
      if (inserted.length === 0) {
        throw new ConcurrencyConflict('GoalAllowance', memberId.value);
      }
      return;
    }
    const updated = await tx
      .update(goalAllowances)
      .set(values)
      .where(and(eq(goalAllowances.memberId, memberId.value), eq(goalAllowances.version, allowance.version)))
      .returning({ memberId: goalAllowances.memberId });
    if (updated.length === 0) {
      throw new ConcurrencyConflict('GoalAllowance', memberId.value);
    }
  }
}
