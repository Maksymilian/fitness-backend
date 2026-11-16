import type { Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Outbox } from '@nestjs/outbox';
import type { Database, DrizzleTransaction } from './database.js';

/**
 * Opens the transaction a use case changes its aggregate in. The aggregate and its domain events
 * (added to the outbox through the same `tx`) commit together; after the commit, the outbox relay
 * is woken up to publish them at once.
 */
@Injectable()
export class Transactions {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly outbox: Outbox<DrizzleTransaction>,
  ) {}

  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    // The domain sees the Drizzle transaction only as its opaque Transaction handle (libs/ddd).
    const result = await this.db.transaction((tx) => work(tx as unknown as Transaction));
    this.outbox.notify();
    return result;
  }
}
