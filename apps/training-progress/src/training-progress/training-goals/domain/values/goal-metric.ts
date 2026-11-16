import { UnknownGoalMetric } from '../errors/unknown-goal-metric.js';

/** How a goal metric is stored and published. */
export type GoalMetricName = 'DISTANCE' | 'DURATION' | 'CALORIES' | 'WORKOUT_COUNT';

const GOAL_METRICS: readonly GoalMetricName[] = ['DISTANCE', 'DURATION', 'CALORIES', 'WORKOUT_COUNT'];

/** What a goal counts: meters, seconds, kilocalories, or workouts. */
export class GoalMetric {
  private constructor(readonly value: GoalMetricName) {}

  static from(value: string): GoalMetric {
    if (!GOAL_METRICS.includes(value as GoalMetricName)) {
      throw new UnknownGoalMetric(value);
    }
    return new GoalMetric(value as GoalMetricName);
  }

  equals(other: GoalMetric): boolean {
    return this.value === other.value;
  }
}
