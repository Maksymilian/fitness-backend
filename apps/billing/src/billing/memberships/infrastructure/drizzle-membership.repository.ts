import { ConcurrencyConflict, type Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { drizzleTransaction, isUniqueViolation } from '../../../platform/database/database.js';
import { memberships } from '../../../platform/database/schema.js';
import { Membership } from '../domain/membership.js';
import { MembershipRepository } from '../domain/membership.repository.js';
import { MemberId } from '../domain/values/member-id.js';
import { MembershipId } from '../domain/values/membership-id.js';
import { MembershipPlan } from '../domain/values/membership-plan.js';
import { MembershipStatus } from '../domain/values/membership-status.js';
import { ProviderReference } from '../domain/values/provider-reference.js';

type MembershipRow = typeof memberships.$inferSelect;

@Injectable()
export class DrizzleMembershipRepository extends MembershipRepository {
  async find(transaction: Transaction, memberId: MemberId): Promise<Membership | undefined> {
    const [row] = await drizzleTransaction(transaction).select().from(memberships).where(eq(memberships.memberId, memberId.value));
    return row && toMembership(row);
  }

  async findByProviderReference(transaction: Transaction, providerReference: string): Promise<Membership | undefined> {
    const [row] = await drizzleTransaction(transaction).select().from(memberships).where(eq(memberships.providerReference, providerReference));
    return row && toMembership(row);
  }

  async save(transaction: Transaction, membership: Membership): Promise<void> {
    const tx = drizzleTransaction(transaction);
    const p = membership.props;
    const changing = {
      plan: p.plan.value,
      status: p.status.value,
      paidThrough: p.paidThrough,
      renews: p.renews,
      providerReference: p.providerReference.value,
      startedAt: p.startedAt,
      endedAt: p.endedAt,
      revision: p.revision,
    };
    if (membership.version === 0) {
      try {
        await tx.insert(memberships).values({ id: p.id.value, memberId: p.memberId.value, ...changing });
      } catch (error) {
        // Two first payments of one member at once: the other one started the membership.
        if (isUniqueViolation(error, 'memberships_member_unique')) {
          throw new ConcurrencyConflict('Membership', p.memberId.value);
        }
        throw error;
      }
      return;
    }
    const updated = await tx
      .update(memberships)
      .set(changing)
      .where(and(eq(memberships.id, p.id.value), eq(memberships.revision, membership.version)))
      .returning({ id: memberships.id });
    if (updated.length === 0) {
      throw new ConcurrencyConflict('Membership', p.id.value);
    }
  }
}

function toMembership(row: MembershipRow): Membership {
  return Membership.reconstitute({
    id: MembershipId.from(row.id),
    memberId: MemberId.from(row.memberId),
    plan: MembershipPlan.from(row.plan),
    status: MembershipStatus.from(row.status),
    paidThrough: row.paidThrough,
    renews: row.renews,
    providerReference: ProviderReference.from(row.providerReference),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    revision: row.revision,
  });
}
