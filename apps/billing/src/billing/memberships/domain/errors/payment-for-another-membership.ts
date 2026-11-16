import { DomainError } from '@app/ddd';

/** Thrown when a payment refers to a provider membership other than the member's. */
export class PaymentForAnotherMembership extends DomainError {
  readonly kind = 'conflict';

  constructor(memberId: string, providerReference: string) {
    super(`A payment for ${providerReference} arrived while ${memberId}'s active membership is another one: refund one of them`);
  }
}
