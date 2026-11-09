import type { Transactions } from '../../../../platform/database/transactions.js';
import type { DomainEventPublisher } from '../../../../platform/outbox/domain-event-publisher.js';
import { MembershipNotFound } from '../../domain/errors/membership-not-found.js';
import { MembershipEnded } from '../../domain/events/membership-ended.js';
import { Membership } from '../../domain/membership.js';
import type { MembershipRepository } from '../../domain/membership.repository.js';
import { MemberId } from '../../domain/values/member-id.js';
import { MembershipPlan } from '../../domain/values/membership-plan.js';
import { ProviderReference } from '../../domain/values/provider-reference.js';
import type { MembershipQueries } from '../queries/membership-queries.js';
import { ChangeMembershipCommand } from './change-membership.command.js';
import { ChangeMembershipHandler } from './change-membership.handler.js';

const subscription = ProviderReference.from('sub_1');
const end = new ChangeMembershipCommand(subscription, { kind: 'end' }, 'evt_1');

/** Given the membership Billing has for the subscription (or none), and whether its payment is in the ledger. */
function given(membership: Membership | undefined, paymentRecorded: boolean) {
  const memberships = { findByProviderReference: vi.fn().mockResolvedValue(membership), save: vi.fn() };
  const events = { publish: vi.fn() };
  const transactions = { runOnce: vi.fn((_consumer: string, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}).then(() => ({}))) };
  const queries = { paymentRecordedFor: vi.fn().mockResolvedValue(paymentRecorded) };
  const handler = new ChangeMembershipHandler(
    memberships as unknown as MembershipRepository,
    transactions as unknown as Transactions,
    events as unknown as DomainEventPublisher,
    queries as unknown as MembershipQueries,
  );
  return { handler, memberships, events, queries };
}

describe('ChangeMembershipHandler', () => {
  it('ignores the end of a membership that was never paid for', async () => {
    const { handler, memberships } = given(undefined, false);

    await expect(handler.execute(end)).resolves.toEqual({ duplicate: false });

    expect(memberships.save).not.toHaveBeenCalled();
  });

  it('refuses an end whose payment is recorded but not applied yet, so the provider sends it again', async () => {
    const { handler, queries } = given(undefined, true);

    await expect(handler.execute(end)).rejects.toThrow(MembershipNotFound);

    expect(queries.paymentRecordedFor).toHaveBeenCalledWith('sub_1');
  });

  it('ends the membership once the payment is applied', async () => {
    const membership = Membership.start({
      memberId: MemberId.from('ada@example.com'),
      payment: { plan: MembershipPlan.Monthly, paidThrough: new Date('2026-11-30T10:00:00Z'), providerReference: subscription },
      now: new Date('2026-10-30T10:00:00Z'),
    });
    membership.pullDomainEvents();
    const { handler, memberships, events } = given(membership, true);

    await handler.execute(end);

    expect(memberships.save).toHaveBeenCalledWith({}, membership);
    expect(events.publish).toHaveBeenCalledWith({}, [expect.any(MembershipEnded)]);
  });
});
