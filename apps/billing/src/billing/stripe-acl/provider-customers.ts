import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { Database } from '../../platform/database/database.js';
import { providerCustomers } from '../../platform/database/schema.js';

/**
 * The anticorruption layer's map from a member to the payment provider's customer (Stripe's
 * `cus_...`): recorded from the first payment, so a member's refunds find them, and their next
 * checkout and the billing portal reuse the same customer. Not part of the model.
 */
@Injectable()
export class ProviderCustomers {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Records the pair once; recording it again changes nothing. */
  async record(memberId: string, customerReference: string): Promise<void> {
    await this.db.insert(providerCustomers).values({ memberId, customerReference, recordedAt: new Date() }).onConflictDoNothing();
  }

  async customerOf(memberId: string): Promise<string | undefined> {
    const [row] = await this.db.select().from(providerCustomers).where(eq(providerCustomers.memberId, memberId));
    return row?.customerReference;
  }

  async memberOf(customerReference: string): Promise<string | undefined> {
    const [row] = await this.db.select().from(providerCustomers).where(eq(providerCustomers.customerReference, customerReference));
    return row?.memberId;
  }
}
