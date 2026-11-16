import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CacheKeys } from '../../../../platform/cache/cache-keys.js';
import { ReadCache } from '../../../../platform/cache/read-cache.js';
import { PersonalRecordQueries } from './personal-record-queries.js';
import { PersonalRecordsQuery } from './personal-records.query.js';

const TEN_MINUTES = 10 * 60 * 1000;

/** All of the member's records are cached under one key, deleted when a record is set or withdrawn. */
@QueryHandler(PersonalRecordsQuery)
export class PersonalRecordsHandler implements IQueryHandler<PersonalRecordsQuery> {
  constructor(
    private readonly queries: PersonalRecordQueries,
    private readonly cache: ReadCache,
  ) {}

  async execute({ memberId, discipline }: PersonalRecordsQuery) {
    const records = await this.cache.getOrLoad(CacheKeys.personalRecords(memberId.value), TEN_MINUTES, () => this.queries.ofMember(memberId.value));
    // Cached as JSON: dates come back as strings.
    return records
      .filter((record) => !discipline || record.discipline === discipline.value)
      .map((record) => ({
        ...record,
        setAt: new Date(record.setAt),
        loggedWorkout: { ...record.loggedWorkout, startedAt: new Date(record.loggedWorkout.startedAt) },
      }));
  }
}
