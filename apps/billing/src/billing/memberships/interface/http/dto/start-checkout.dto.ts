import { IsIn } from 'class-validator';

/** The body of a checkout request: the membership plan to pay for. */
export class StartCheckoutDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  plan: 'MONTHLY' | 'YEARLY';
}
