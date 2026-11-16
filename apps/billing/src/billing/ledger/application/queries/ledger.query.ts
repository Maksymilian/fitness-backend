import { Query } from '@nestjs/cqrs';
import type { MemberId } from '../../../memberships/domain/values/member-id.js';
import type { LedgerPage } from '../ledger.representation.interface.js';

/** Asks for a page of a member's ledger: their payments and refunds, newest first. */
export class LedgerQuery extends Query<LedgerPage> {
  constructor(
    readonly memberId: MemberId,
    readonly limit: number,
    readonly cursor: string | null,
  ) {
    super();
  }
}
