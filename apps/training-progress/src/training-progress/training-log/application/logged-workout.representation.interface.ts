/** A logged workout as the GraphQL API shows it. */
export interface LoggedWorkoutRepresentation {
  id: string;
  discipline: string;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number;
  calories: number;
}

/** One page of a member's training log, newest first. */
export interface TrainingLogPage {
  edges: Array<{ cursor: string; node: LoggedWorkoutRepresentation }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
