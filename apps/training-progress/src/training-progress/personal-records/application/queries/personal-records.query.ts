import { Query } from '@nestjs/cqrs';
import type { MemberId } from '../../../members/domain/values/member-id.js';
import type { Discipline } from '../../../training-log/domain/values/discipline.js';
import type { PersonalRecordRepresentation } from '../personal-record.representation.interface.js';

/** Asks for a member's personal records, optionally in one discipline. */
export class PersonalRecordsQuery extends Query<PersonalRecordRepresentation[]> {
  constructor(
    readonly memberId: MemberId,
    readonly discipline: Discipline | null,
  ) {
    super();
  }
}
