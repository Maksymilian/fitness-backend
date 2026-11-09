import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { ledgerEntries } from '../../../platform/database/schema.js';
import type { LedgerPage } from '../application/ledger.representation.interface.js';
import { LedgerQueries } from '../application/queries/ledger-queries.js';

/** A position in a member's ledger: the last entry's time and id, as `<ISO time>_<id>`. */
export const LEDGER_CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f-]{36})$/;

@Injectable()
export class DrizzleLedgerQueries extends LedgerQueries {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async ofMember(memberId: string, limit: number, cursor: string | null): Promise<LedgerPage> {
    const after = cursor ? LEDGER_CURSOR.exec(cursor) : null;
    const rows = await this.db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.memberId, memberId),
          after ? sql`(${ledgerEntries.occurredAt}, ${ledgerEntries.id}) < (${after[1]}::timestamptz, ${after[2]}::uuid)` : undefined,
        ),
      )
      // Served by the (member_id, occurred_at desc, id desc) index.
      .orderBy(desc(ledgerEntries.occurredAt), desc(ledgerEntries.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      entries: page.map((row) => ({
        id: row.id,
        kind: row.kind,
        amount: row.amount,
        currency: row.currency,
        occurredAt: row.occurredAt.toISOString(),
        plan: row.plan,
        paidThrough: row.paidThrough?.toISOString() ?? null,
      })),
      nextCursor: rows.length > limit && last ? `${last.occurredAt.toISOString()}_${last.id}` : null,
    };
  }
}
