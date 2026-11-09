import { Query } from '@nestjs/cqrs';
import type { MemberId } from '../../domain/values/member-id.js';
import type { MembershipRepresentation } from '../membership.representation.interface.js';

export class MembershipQuery extends Query<MembershipRepresentation> {
  constructor(readonly memberId: MemberId) {
    super();
  }
}
