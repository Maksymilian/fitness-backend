import { OnTracedOutboxMessage } from '@app/telemetry';
import { Injectable } from '@nestjs/common';
import type { OutboxHandlerContext } from '@nestjs/outbox';
import { Transactions } from '../../../platform/database/transactions.js';
import { DomainEventPublisher } from '../../../platform/outbox/domain-event-publisher.js';
import { DomainTopics, type PaymentRecordedPayloadV1 } from '../../../platform/outbox/domain-topics.js';
import { Membership } from '../domain/membership.js';
import { MembershipRepository } from '../domain/membership.repository.js';
import { MemberId } from '../domain/values/member-id.js';
import { MembershipPlan } from '../domain/values/membership-plan.js';
import { ProviderReference } from '../domain/values/provider-reference.js';

const CONSUMER = 'apply-payment';

/**
 * Apply Payment: whenever a payment is recorded, start the member's membership with it, or renew
 * it. One `Membership` per transaction, with the inbox record in it: exactly once. A payment for a
 * second membership while one is active fails, is retried, and is dead-lettered: an incident.
 */
@Injectable()
export class ApplyPaymentPolicy {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly transactions: Transactions,
    private readonly events: DomainEventPublisher,
  ) {}

  @OnTracedOutboxMessage(DomainTopics.paymentRecordedV1, { consumer: CONSUMER })
  async paymentRecorded(payload: PaymentRecordedPayloadV1, { message }: OutboxHandlerContext) {
    const memberId = MemberId.from(payload.memberId);
    const payment = {
      plan: MembershipPlan.from(payload.plan),
      paidThrough: new Date(payload.paidThrough),
      providerReference: ProviderReference.from(payload.membershipReference),
    };
    await this.transactions.runOnce(CONSUMER, message.id, async (tx) => {
      const now = new Date();
      const existing = await this.memberships.find(tx, memberId);
      const membership = existing ?? Membership.start({ memberId, payment, now });
      existing?.renew(payment, now);
      if (membership.hasChanges()) {
        await this.memberships.save(tx, membership);
        await this.events.publish(tx, membership.pullDomainEvents());
      }
    });
  }
}
