import type { WorkoutMetrics } from '../../../training-log/domain/values/workout-metrics.js';

/** How a record metric is stored and published. */
export type RecordMetricName = 'LONGEST_DISTANCE' | 'LONGEST_DURATION' | 'MOST_CALORIES';

/** What a personal record measures, and how to read it from a workout's metrics. */
export class RecordMetric {
  static readonly LongestDistance = new RecordMetric('LONGEST_DISTANCE', (metrics) => metrics.distance.meters);
  static readonly LongestDuration = new RecordMetric('LONGEST_DURATION', (metrics) => metrics.duration.seconds);
  static readonly MostCalories = new RecordMetric('MOST_CALORIES', (metrics) => metrics.calories.kilocalories);

  static readonly all: readonly RecordMetric[] = [RecordMetric.LongestDistance, RecordMetric.LongestDuration, RecordMetric.MostCalories];

  private constructor(
    readonly value: RecordMetricName,
    private readonly read: (metrics: WorkoutMetrics) => number,
  ) {}

  static from(value: string): RecordMetric {
    const metric = RecordMetric.all.find((candidate) => candidate.value === value);
    if (!metric) {
      throw new TypeError(`"${value}" is not a record metric`);
    }
    return metric;
  }

  /** The workout's value of this metric: meters, seconds or kilocalories. */
  of(metrics: WorkoutMetrics): number {
    return this.read(metrics);
  }

  equals(other: RecordMetric): boolean {
    return this.value === other.value;
  }
}
