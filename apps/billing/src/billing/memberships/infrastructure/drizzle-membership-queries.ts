import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../platform/database/database.js';
import { ledgerEntries, memberships } from '../../../platform/database/schema.js';
import type { MembershipRepresentation } from '../application/membership.representation.interface.js';
import { MembershipQueries } from '../application/queries/membership-queries.js';

@Injectable()
export class DrizzleMembershipQueries extends MembershipQueries {
  constructor(@InjectDrizzle() private readonly db: Database) {
    super();
  }

  async ofMember(memberId: string): Promise<MembershipRepresentation | undefined> {
    const [row] = await this.db.select().from(memberships).where(eq(memberships.memberId, memberId));
    return (
      row && {
        id: row.id,
        memberId: row.memberId,
        plan: row.plan,
        status: row.status,
        paidThrough: row.paidThrough.toISOString(),
        renews: row.renews,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
      }
    );
  }

  async paymentRecordedFor(providerReference: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.kind, 'PAYMENT'), eq(ledgerEntries.membershipReference, providerReference)))
      .limit(1);
    return rows.length > 0;
  }
}
