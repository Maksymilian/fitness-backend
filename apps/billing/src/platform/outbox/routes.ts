import { BillingTopics } from '@app/billing-contracts';
import { PaymentRecorded } from '../../billing/ledger/domain/events/payment-recorded.js';
import { MembershipEnded } from '../../billing/memberships/domain/events/membership-ended.js';
import { MembershipStarted } from '../../billing/memberships/domain/events/membership-started.js';
import { toMembershipSnapshotV1 } from '../../billing/published-language/membership-snapshot.mapper.js';
import { DomainTopics, type PaymentRecordedPayloadV1 } from './domain-topics.js';
import { RouteTable } from './route-table.js';

/**
 * Which domain events become which outbox messages (architecture 4.1, 18.4). Everything is keyed by
 * member, so a member's payments reach their membership in order, and a membership's start never
 * overtakes its end downstream. Renewals, plan switches, cancellations, resumptions and refunds have
 * no subscriber yet, so they aren't written.
 */
export const billingRoutes = new RouteTable()
  .route(PaymentRecorded, {
    topic: DomainTopics.paymentRecordedV1,
    key: (event) => event.memberId.value,
    payload: (event): PaymentRecordedPayloadV1 => ({
      ledgerEntryId: event.ledgerEntryId.value,
      memberId: event.memberId.value,
      amount: event.amount.toFixed(),
      currency: event.amount.currency.code,
      plan: event.plan.value,
      paidThrough: event.paidThrough.toISOString(),
      membershipReference: event.membershipReference.value,
    }),
  })
  .route(MembershipStarted, {
    topic: BillingTopics.membershipStartedV1,
    key: (event) => event.membership.memberId.value,
    payload: (event) => toMembershipSnapshotV1(event.membership),
  })
  .route(MembershipEnded, {
    topic: BillingTopics.membershipEndedV1,
    key: (event) => event.membership.memberId.value,
    payload: (event) => toMembershipSnapshotV1(event.membership),
  });
