import { DomainError } from '@app/ddd';

/** Thrown when an equipment type isn't `BIKE`, `TREADMILL` or `ROWER`. */
export class UnknownEquipmentType extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(value: string) {
    super(`"${value}" is not an equipment type: BIKE, TREADMILL or ROWER`);
  }
}
