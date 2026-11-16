import { ArgsType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional } from 'class-validator';
import { DisciplineEnum } from '../../../training-log/interface/graphql/discipline.enum.js';

/** The arguments of a member's `personalRecords` field. */
@ArgsType()
export class PersonalRecordsArgs {
  @Field(() => DisciplineEnum, { nullable: true })
  @IsOptional()
  @IsEnum(DisciplineEnum)
  discipline?: DisciplineEnum;
}
