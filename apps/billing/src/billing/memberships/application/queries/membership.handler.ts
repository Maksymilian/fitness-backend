import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { MembershipNotFound } from '../../domain/errors/membership-not-found.js';
import { MembershipQueries } from './membership-queries.js';
import { MembershipQuery } from './membership.query.js';

@QueryHandler(MembershipQuery)
export class MembershipHandler implements IQueryHandler<MembershipQuery> {
  constructor(private readonly memberships: MembershipQueries) {}

  async execute({ memberId }: MembershipQuery) {
    const membership = await this.memberships.ofMember(memberId.value);
    if (!membership) {
      throw new MembershipNotFound(memberId.value);
    }
    return membership;
  }
}
