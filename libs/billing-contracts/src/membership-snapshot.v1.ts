import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export const MEMBERSHIP_PLANS_V1 = ['MONTHLY', 'YEARLY'] as const;
export const MEMBERSHIP_STATUSES_V1 = ['ACTIVE', 'ENDED'] as const;

/**
 * The payload of every Billing integration event: the whole membership as it is after the change
 * (event-carried state transfer). No amounts: what members paid stays in Billing.
 */
export class MembershipSnapshotV1 {
  @IsUUID()
  membershipId: string;

  /** The member: until Identity exists, their email address. */
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsIn(MEMBERSHIP_PLANS_V1)
  plan: (typeof MEMBERSHIP_PLANS_V1)[number];

  @IsIn(MEMBERSHIP_STATUSES_V1)
  status: (typeof MEMBERSHIP_STATUSES_V1)[number];

  /** ISO 8601, UTC: the end of the last period paid for. */
  @IsDateString({ strict: true })
  paidThrough: string;

  @IsBoolean()
  renews: boolean;

  /** 1 when the membership first started, plus 1 for every change: a newer one has a higher revision. */
  @IsInt()
  @Min(1)
  revision: number;
}
