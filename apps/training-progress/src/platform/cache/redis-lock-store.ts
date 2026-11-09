import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type LockAcquireResult, type LockStore, LocksStorage } from '@nestjs/locks';
import { createClient } from '@redis/client';
import type { Environment } from '../config/environment.js';

// The store on Redis from docs/nestjs/reliability/locks.md: each method is one Lua script, which
// Redis runs atomically.

// Takes the lock if nobody holds it, expiring on Redis's clock, and draws a fencing token from a
// counter that never goes back. Returns the token, or 0.
const ACQUIRE = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
  return redis.call('INCR', KEYS[2])
end
return 0
`;

// Renews the lock, if it is still ours.
const RENEW = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

// Deletes the lock, if it is still ours.
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Where the fencing counter lives; no lock key can be named like it. */
const FENCING_COUNTER = 'locks:fencing-token';

/**
 * `@nestjs/locks`' store, on the cache's Redis (REDIS_URL), with a connection of its own: the
 * locks every instance shares, such as the read cache's load lock (section 8.1). A dropped
 * connection never takes the service down: the calls fail at once while Redis is unreachable, and
 * the client reconnects in the background.
 */
@Injectable()
export class RedisLockStore implements LockStore, OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisLockStore.name);
  private readonly redis;

  constructor(config: ConfigService<Environment, true>, storage: LocksStorage) {
    let lastWarning = 0;
    this.redis = createClient({
      url: config.get('REDIS_URL', { infer: true }),
      // Fail at once while disconnected, instead of queueing commands until Redis is back.
      disableOfflineQueue: true,
      socket: { connectTimeout: 1000, reconnectStrategy: (retries: number) => Math.min(retries * 200, 5000) },
    }).on('error', (error: Error) => {
      // At most one warning every 10 seconds while Redis is down.
      if (Date.now() - lastWarning > 10_000) {
        lastWarning = Date.now();
        this.logger.warn(`Redis unavailable for locks: ${error.message}`);
      }
    });
    storage.registerSource(this);
  }

  onModuleInit(): void {
    // In the background: a Redis that is down doesn't stop the service from starting.
    this.redis.connect().catch(() => undefined);
  }

  // After beforeApplicationShutdown(), where @nestjs/locks releases the locks still held.
  async onApplicationShutdown(): Promise<void> {
    if (this.redis.isOpen) {
      await this.redis.close();
    }
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    const token = Number(await this.redis.eval(ACQUIRE, { keys: [this.key(key), FENCING_COUNTER], arguments: [owner, String(ttl)] }));
    return token > 0 ? { acquired: true, fencingToken: token } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    return Number(await this.redis.eval(RENEW, { keys: [this.key(key)], arguments: [owner, String(ttl)] })) === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    return Number(await this.redis.eval(RELEASE, { keys: [this.key(key)], arguments: [owner] })) === 1;
  }

  /** Only when connected; the store's contract test waits for it. */
  async connected(): Promise<void> {
    if (!this.redis.isReady) {
      await new Promise((resolve) => this.redis.once('ready', resolve));
    }
  }

  private key(key: string) {
    return `locks:key:${key}`;
  }
}
