import { DomainError } from '@app/ddd';

/** Thrown when a period kind isn't `WEEK`, `MONTH` or `YEAR`. */
export class UnknownPeriodKind extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not a period kind: WEEK, MONTH or YEAR`);
  }
}
