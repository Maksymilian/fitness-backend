import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CacheKeys } from '../../../../platform/cache/cache-keys.js';
import { ReadCache } from '../../../../platform/cache/read-cache.js';
import { utcDay } from '../../../calendar/domain/values/training-period.js';
import { ProgressSummaries } from './progress-summaries.js';
import { StreakQuery } from './streak.query.js';

/** Answers a `StreakQuery`, through the read cache. */
@QueryHandler(StreakQuery)
export class StreakHandler implements IQueryHandler<StreakQuery> {
  constructor(
    private readonly summaries: ProgressSummaries,
    private readonly cache: ReadCache,
  ) {}

  async execute({ memberId, today }: StreakQuery) {
    const day = utcDay(today);
    // Cached until the end of the UTC day: tomorrow the streak may break without any new workout.
    const untilEndOfDay = day.getTime() + 86_400_000 - today.getTime();
    return this.cache.getOrLoad(CacheKeys.streak(memberId.value), untilEndOfDay, async () => streak(await this.summaries.activeDays(memberId.value), day));
  }
}

/** Counts consecutive active days back from today, or from yesterday when today has none yet. */
export function streak(activeDaysNewestFirst: readonly Date[], today: Date): number {
  const [latest] = activeDaysNewestFirst;
  if (!latest || daysBetween(latest, today) > 1) {
    return 0;
  }
  let count = 1;
  while (count < activeDaysNewestFirst.length && daysBetween(activeDaysNewestFirst[count], activeDaysNewestFirst[count - 1]) === 1) {
    count++;
  }
  return count;
}

/** Whole days between two UTC midnights, independent of the server's time zone. */
function daysBetween(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}
