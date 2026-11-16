import { InvalidWorkoutMetrics } from '../errors/invalid-workout-metrics.js';
import { Calories } from './calories.js';
import { Distance } from './distance.js';
import { Duration } from './duration.js';

/** What a logged workout measured: duration, distance and calories. Training Progress' own. */
export class WorkoutMetrics {
  private constructor(
    readonly duration: Duration,
    readonly distance: Distance,
    readonly calories: Calories,
  ) {}

  static of(metrics: { durationSeconds: number; distanceMeters: number; calories: number }): WorkoutMetrics {
    const duration = Duration.of(metrics.durationSeconds);
    if (duration.seconds === 0) {
      throw new InvalidWorkoutMetrics('a workout lasts more than 0 seconds');
    }
    return new WorkoutMetrics(duration, Distance.of(metrics.distanceMeters), Calories.of(metrics.calories));
  }

  equals(other: WorkoutMetrics): boolean {
    return this.duration.equals(other.duration) && this.distance.equals(other.distance) && this.calories.equals(other.calories);
  }
}
