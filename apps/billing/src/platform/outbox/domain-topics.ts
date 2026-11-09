/**
 * Topics of the domain events that stay inside Billing, for its policy. Versioned: during a rolling
 * deploy, the previous release's messages can reach the new one.
 */
export const DomainTopics = {
  paymentRecordedV1: 'billing.domain.payment-recorded.v1',
} as const;

/** Payload of `billing.domain.payment-recorded.v1`: what a payment paid for. The amount is text, exact. */
export interface PaymentRecordedPayloadV1 {
  ledgerEntryId: string;
  memberId: string;
  amount: string;
  currency: string;
  plan: string;
  paidThrough: string;
  membershipReference: string;
}
