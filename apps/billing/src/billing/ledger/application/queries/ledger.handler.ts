import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { LedgerQueries } from './ledger-queries.js';
import { LedgerQuery } from './ledger.query.js';

@QueryHandler(LedgerQuery)
export class LedgerHandler implements IQueryHandler<LedgerQuery> {
  constructor(private readonly ledger: LedgerQueries) {}

  execute({ memberId, limit, cursor }: LedgerQuery) {
    return this.ledger.ofMember(memberId.value, limit, cursor);
  }
}
