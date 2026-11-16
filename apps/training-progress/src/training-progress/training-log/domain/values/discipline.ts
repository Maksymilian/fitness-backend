import { UnknownDiscipline } from '../errors/unknown-discipline.js';

/** How a discipline is stored and published. */
export type DisciplineName = 'CYCLING' | 'RUNNING' | 'WALKING' | 'ROWING';

/** The kind of exercise a logged workout is. Training Progress' own, translated from the upstream string. */
export class Discipline {
  static readonly Cycling = new Discipline('CYCLING');
  static readonly Running = new Discipline('RUNNING');
  static readonly Walking = new Discipline('WALKING');
  static readonly Rowing = new Discipline('ROWING');

  static readonly all: readonly Discipline[] = [Discipline.Cycling, Discipline.Running, Discipline.Walking, Discipline.Rowing];

  private constructor(readonly value: DisciplineName) {}

  static from(value: string): Discipline {
    const discipline = Discipline.all.find((candidate) => candidate.value === value);
    if (!discipline) {
      throw new UnknownDiscipline(value);
    }
    return discipline;
  }

  equals(other: Discipline): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
