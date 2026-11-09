import type { MembershipRepresentation } from '../membership.representation.interface.js';

/** Read port: memberships read straight from SQL, bypassing the domain model. */
export abstract class MembershipQueries {
  abstract ofMember(memberId: string): Promise<MembershipRepresentation | undefined>;

  /** Whether the ledger has a payment for the membership with this provider reference, applied or not yet. */
  abstract paymentRecordedFor(providerReference: string): Promise<boolean>;
}
