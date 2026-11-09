/** A membership, as the REST API shows it. */
export interface MembershipRepresentation {
  id: string;
  memberId: string;
  plan: string;
  status: string;
  paidThrough: string;
  renews: boolean;
  startedAt: string;
  endedAt: string | null;
}
