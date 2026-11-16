import { ArgsType, Field } from '@nestjs/graphql';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { DisciplineEnum } from '../../../training-log/interface/graphql/discipline.enum.js';
import { PeriodKindEnum } from './period-kind.enum.js';

/** The arguments of a member's `progressSummary` field: the period kind, a day inside it and an optional discipline. */
@ArgsType()
export class ProgressSummaryArgs {
  @Field(() => PeriodKindEnum)
  @IsEnum(PeriodKindEnum)
  period: PeriodKindEnum;

  /** The training period that contains this date; today (UTC) by default. */
  @Field(() => Date, { nullable: true, description: 'The training period that contains this date (default: today, UTC).' })
  @IsOptional()
  @IsDate()
  date?: Date;

  @Field(() => DisciplineEnum, { nullable: true })
  @IsOptional()
  @IsEnum(DisciplineEnum)
  discipline?: DisciplineEnum;
}
