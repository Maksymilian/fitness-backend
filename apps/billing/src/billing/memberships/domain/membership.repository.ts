import type { Transaction } from '@app/ddd';
import type { MemberId } from './values/member-id.js';
import type { Membership } from './membership.js';

/** Port: loads and saves whole `Membership` aggregates, one per member. */
export abstract class MembershipRepository {
  /** The member's membership, active or ended, through the transaction it's changed in. */
  abstract find(tx: Transaction, memberId: MemberId): Promise<Membership | undefined>;

  /** The membership the payment provider knows by this reference (Stripe's subscription), if any. */
  abstract findByProviderReference(tx: Transaction, providerReference: string): Promise<Membership | undefined>;

  /**
   * Inserts a new membership or saves a change, through the transaction.
   * @throws ConcurrencyConflict when the membership changed since it was loaded, or the member got one meanwhile
   */
  abstract save(tx: Transaction, membership: Membership): Promise<void>;
}
