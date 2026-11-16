import { DomainError } from '@app/ddd';

/** Thrown when equipment records a discipline its type can't (a rower recording running). */
export class DisciplineNotSupported extends DomainError {
  readonly kind = 'invariant-violation';

  constructor(equipmentType: string, discipline: string) {
    super(`${equipmentType} equipment can't record ${discipline}`);
  }
}
