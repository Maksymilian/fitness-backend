import { DomainError } from '@app/ddd';

export class LedgerEntryAlreadyRecorded extends DomainError {
  readonly kind = 'conflict';

  constructor(kind: string, providerReference: string) {
    super(`A ${kind.toLowerCase()} for ${providerReference} is already in the ledger`);
  }
}
