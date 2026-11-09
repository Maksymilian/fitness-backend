import type { Transaction } from '@app/ddd';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Outbox, OutboxInbox, type OutboxInboxResult } from '@nestjs/outbox';
import type { Database, DrizzleTransaction } from './database.js';

/**
 * Opens the transaction a use case or a policy changes its aggregate in. The aggregate and its
 * domain events (added to the outbox through the same `tx`) commit together; after the commit,
 * the outbox relay is woken up.
 */
@Injectable()
export class Transactions {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly outbox: Outbox<DrizzleTransaction>,
    private readonly inbox: OutboxInbox,
  ) {}

  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    const result = await this.db.transaction((tx) => work(tx as unknown as Transaction));
    this.outbox.notify();
    return result;
  }

  /**
   * Runs the work exactly once per message for the consumer: the inbox record commits in the same
   * transaction as the work's writes, and a redelivered message finds it and skips the work.
   */
  async runOnce<T>(consumer: string, messageId: string, work: (tx: Transaction) => Promise<T>): Promise<OutboxInboxResult<T>> {
    const outcome = await this.db.transaction((tx) =>
      Promise.resolve(this.inbox.processInTransaction(tx, consumer, messageId, () => work(tx as unknown as Transaction))),
    );
    this.outbox.notify();
    return outcome as OutboxInboxResult<T>;
  }
}
