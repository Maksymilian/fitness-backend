import { ArgsType, Field, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { DisciplineEnum } from './discipline.enum.js';

/** The arguments of a member's `trainingLog` field: page size, cursor and an optional discipline. */
@ArgsType()
export class TrainingLogArgs {
  @Field(() => Int, { defaultValue: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  first: number = 20;

  /** `endCursor` of the previous page. Empty means the first page. */
  @Field(() => String, { nullable: true })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[0-9a-f-]{36}$/)
  after?: string;

  @Field(() => DisciplineEnum, { nullable: true })
  @IsOptional()
  @IsEnum(DisciplineEnum)
  discipline?: DisciplineEnum;
}
