import { registerEnumType } from '@nestjs/graphql';

/** The period kinds in the GraphQL schema. */
export enum PeriodKindEnum {
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

registerEnumType(PeriodKindEnum, { name: 'PeriodKind' });
