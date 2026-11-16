import { ArgsType, Field, ID } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

/** The arguments of the `member` query. */
@ArgsType()
export class MemberArgs {
  /** Until Identity exists, a member is identified by their email address (not verified). */
  @Field(() => ID)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  id: string;
}
