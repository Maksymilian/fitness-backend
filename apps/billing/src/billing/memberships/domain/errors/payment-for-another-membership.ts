import { DomainError } from '@app/ddd';

export class PaymentForAnotherMembership extends DomainError {
  readonly kind = 'conflict';

  constructor(memberId: string, providerReference: string) {
    super(`A payment for ${providerReference} arrived while ${memberId}'s active membership is another one: refund one of them`);
  }
}
