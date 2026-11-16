import { UTCDate } from '@date-fns/utc';
import { addDays, endOfISOWeek, endOfMonth, endOfYear, startOfDay, startOfISOWeek, startOfMonth, startOfYear } from 'date-fns';
import { UnknownPeriodKind } from '../errors/unknown-period-kind.js';

/** The kinds of training period a goal or a progress summary covers. */
export type PeriodKind = 'WEEK' | 'MONTH' | 'YEAR';

const PERIOD_KINDS: readonly PeriodKind[] = ['WEEK', 'MONTH', 'YEAR'];

/**
 * A calendar week (ISO, Monday to Sunday), month or year, in UTC: `[start, end)`. Built on
 * date-fns (the generic Calendar subdomain): no hand-written week arithmetic.
 */
export class TrainingPeriod {
  private constructor(
    readonly kind: PeriodKind,
    readonly start: Date,
    /** Exclusive: the start of the next period. */
    readonly end: Date,
  ) {}

  static periodKind(value: string): PeriodKind {
    if (!PERIOD_KINDS.includes(value as PeriodKind)) {
      throw new UnknownPeriodKind(value);
    }
    return value as PeriodKind;
  }

  /** The training period of this kind that contains `date`. */
  static containing(kind: PeriodKind, date: Date): TrainingPeriod {
    const utc = new UTCDate(date);
    const [start, lastDay] =
      kind === 'WEEK' ? [startOfISOWeek(utc), endOfISOWeek(utc)] : kind === 'MONTH' ? [startOfMonth(utc), endOfMonth(utc)] : [startOfYear(utc), endOfYear(utc)];
    return new TrainingPeriod(kind, new Date(start.getTime()), new Date(addDays(startOfDay(lastDay), 1).getTime()));
  }

  /** The week, month and year that contain `date`. */
  static allContaining(date: Date): TrainingPeriod[] {
    return PERIOD_KINDS.map((kind) => TrainingPeriod.containing(kind, date));
  }

  contains(date: Date): boolean {
    return date >= this.start && date < this.end;
  }

  equals(other: TrainingPeriod): boolean {
    return this.kind === other.kind && this.start.getTime() === other.start.getTime();
  }
}

/** The UTC calendar day that contains `date`, as midnight UTC. */
export function utcDay(date: Date): Date {
  return new Date(startOfDay(new UTCDate(date)).getTime());
}
