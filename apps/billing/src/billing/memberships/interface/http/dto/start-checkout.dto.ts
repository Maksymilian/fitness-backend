import { IsIn } from 'class-validator';

export class StartCheckoutDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  plan: 'MONTHLY' | 'YEARLY';
}
