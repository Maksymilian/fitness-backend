import { IsEmail } from 'class-validator';

/** Until Identity exists, a member id is the member's email address, not verified. */
export class MemberParams {
  @IsEmail()
  memberId: string;
}
