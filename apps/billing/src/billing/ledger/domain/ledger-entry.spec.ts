import { MemberId } from '../../memberships/domain/values/member-id.js';
import { MembershipPlan } from '../../memberships/domain/values/membership-plan.js';
import { ProviderReference } from '../../memberships/domain/values/provider-reference.js';
import { InvalidLedgerEntryAmount } from './errors/invalid-ledger-entry-amount.js';
import { PaymentRecorded } from './events/payment-recorded.js';
import { RefundRecorded } from './events/refund-recorded.js';
import { LedgerEntry } from './ledger-entry.js';
import { Currency } from './values/currency.js';
import { LedgerEntryKind } from './values/ledger-entry-kind.js';
import { Money } from './values/money.js';

const memberId = MemberId.from('ada@example.com');
const now = new Date('2026-10-30T10:00:00Z');
const paidFor = { plan: MembershipPlan.Monthly, paidThrough: new Date('2026-11-30T10:00:00Z'), membershipReference: ProviderReference.from('sub_1') };

describe('LedgerEntry', () => {
  it('records a payment, with what it paid for', () => {
    const entry = LedgerEntry.recordPayment({
      memberId,
      amount: Money.of('9.99', Currency.EUR),
      occurredAt: now,
      providerReference: ProviderReference.from('in_1'),
      paidFor,
      now,
    });

    const [event] = entry.pullDomainEvents() as PaymentRecorded[];
    expect(event).toBeInstanceOf(PaymentRecorded);
    expect(event.amount.toString()).toBe('9.99 EUR');
    expect(event).toMatchObject({ plan: MembershipPlan.Monthly, paidThrough: paidFor.paidThrough, occurredAt: now });
    expect(entry.props.kind).toBe(LedgerEntryKind.Payment);
  });

  it('records a payment of 0.00: a fully discounted period', () => {
    const entry = LedgerEntry.recordPayment({ memberId, amount: Money.of('0', Currency.EUR), occurredAt: now, providerReference: ProviderReference.from('in_2'), paidFor, now });

    expect(entry.pullDomainEvents()).toEqual([expect.any(PaymentRecorded)]);
  });

  it('records a refund as an entry of its own', () => {
    const entry = LedgerEntry.recordRefund({ memberId, amount: Money.of('5.00', Currency.EUR), occurredAt: now, providerReference: ProviderReference.from('ch_1:500'), now });

    expect(entry.pullDomainEvents()).toEqual([expect.any(RefundRecorded)]);
    expect(entry.props).toMatchObject({ kind: LedgerEntryKind.Refund, paidFor: null });
  });

  it.each([
    ['a negative payment', () => LedgerEntry.recordPayment({ memberId, amount: Money.of('-1', Currency.EUR), occurredAt: now, providerReference: ProviderReference.from('in_3'), paidFor, now })],
    ['a refund of nothing', () => LedgerEntry.recordRefund({ memberId, amount: Money.of('0', Currency.EUR), occurredAt: now, providerReference: ProviderReference.from('ch_2:0'), now })],
  ])('refuses %s', (_, record) => {
    expect(record).toThrow(InvalidLedgerEntryAmount);
  });
});
