import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CacheKeys } from '../../../../platform/cache/cache-keys.js';
import { ReadCache } from '../../../../platform/cache/read-cache.js';
import { TrainingPeriod } from '../../../calendar/domain/values/training-period.js';
import { ProgressSummaries } from './progress-summaries.js';
import { ProgressSummaryQuery } from './progress-summary.query.js';

const TEN_MINUTES = 10 * 60 * 1000;

/** Answers a `ProgressSummaryQuery`, through the read cache. */
@QueryHandler(ProgressSummaryQuery)
export class ProgressSummaryHandler implements IQueryHandler<ProgressSummaryQuery> {
  constructor(
    private readonly summaries: ProgressSummaries,
    private readonly cache: ReadCache,
  ) {}

  async execute({ memberId, kind, date, discipline }: ProgressSummaryQuery) {
    const period = TrainingPeriod.containing(kind, date);
    const key = CacheKeys.progressSummary(memberId.value, kind, period.start, discipline?.value ?? null);
    const summary = await this.cache.getOrLoad(key, TEN_MINUTES, () => this.summaries.summary(memberId.value, period, discipline?.value ?? null));
    // Cached as JSON: dates come back as strings.
    return { ...summary, periodStart: new Date(summary.periodStart), periodEnd: new Date(summary.periodEnd) };
  }
}
