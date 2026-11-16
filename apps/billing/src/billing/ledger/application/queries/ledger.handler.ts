import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { LedgerQueries } from './ledger-queries.js';
import { LedgerQuery } from './ledger.query.js';

/** Answers a `LedgerQuery` with a page of the member's ledger, read straight from SQL. */
@QueryHandler(LedgerQuery)
export class LedgerHandler implements IQueryHandler<LedgerQuery> {
  constructor(private readonly ledger: LedgerQueries) {}

  execute({ memberId, limit, cursor }: LedgerQuery) {
    return this.ledger.ofMember(memberId.value, limit, cursor);
  }
}
