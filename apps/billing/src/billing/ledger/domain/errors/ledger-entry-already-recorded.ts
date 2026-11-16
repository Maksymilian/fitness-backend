import { DomainError } from '@app/ddd';

/** Thrown when the provider's payment or refund is already in the ledger, so it isn't recorded twice. */
export class LedgerEntryAlreadyRecorded extends DomainError {
  readonly kind = 'conflict';

  constructor(kind: string, providerReference: string) {
    super(`A ${kind.toLowerCase()} for ${providerReference} is already in the ledger`);
  }
}
