import { OnTracedOutboxMessage } from '@app/telemetry';
import { Injectable } from '@nestjs/common';
import { DomainTopics, type LoggedWorkoutPayloadV1, type PersonalRecordsPayloadV1 } from '../outbox/domain-topics.js';
import { CacheKeys } from './cache-keys.js';
import { ReadCache } from './read-cache.js';

/**
 * Deletes the cached read models a committed change made stale. It listens to existing facts; no
 * event exists just for it. Deleting a key twice is harmless, so it has no inbox; while Redis is
 * unreachable it fails, and the outbox retries it.
 */
@Injectable()
export class CacheInvalidationHandler {
  constructor(private readonly cache: ReadCache) {}

  @OnTracedOutboxMessage([DomainTopics.workoutLoggedV1, DomainTopics.loggedWorkoutRevisedV1, DomainTopics.loggedWorkoutStoppedCountingV1], {
    consumer: 'cache-invalidation',
    inbox: false,
  })
  async loggedWorkoutChanged({ memberId, startedAt, discipline }: LoggedWorkoutPayloadV1) {
    await this.cache.forget([...CacheKeys.progressSummariesAffectedBy(memberId, new Date(startedAt), discipline), CacheKeys.streak(memberId)]);
  }

  @OnTracedOutboxMessage([DomainTopics.personalRecordSetV1, DomainTopics.personalRecordWithdrawnV1], {
    consumer: 'cache-invalidation',
    inbox: false,
  })
  async personalRecordsChanged({ memberId }: PersonalRecordsPayloadV1) {
    await this.cache.forget([CacheKeys.personalRecords(memberId)]);
  }
}
