import { InvalidWorkoutMetrics } from '../errors/invalid-workout-metrics.js';
import { Calories } from './calories.js';
import { Distance } from './distance.js';
import { Duration } from './duration.js';

const MAX_DURATION_SECONDS = 24 * 60 * 60;

/** What a workout measured. A workout lasts more than zero seconds and at most 24 hours. */
export class WorkoutMetrics {
  private constructor(
    readonly duration: Duration,
    readonly distance: Distance,
    readonly calories: Calories,
  ) {}

  static of(metrics: { durationSeconds: number; distanceMeters: number; calories: number }): WorkoutMetrics {
    const duration = Duration.of(metrics.durationSeconds);
    if (duration.seconds === 0 || duration.seconds > MAX_DURATION_SECONDS) {
      throw new InvalidWorkoutMetrics(`duration must be more than 0 and at most ${MAX_DURATION_SECONDS} seconds`);
    }
    return new WorkoutMetrics(duration, Distance.of(metrics.distanceMeters), Calories.of(metrics.calories));
  }

  equals(other: WorkoutMetrics): boolean {
    return this.duration.equals(other.duration) && this.distance.equals(other.distance) && this.calories.equals(other.calories);
  }
}
