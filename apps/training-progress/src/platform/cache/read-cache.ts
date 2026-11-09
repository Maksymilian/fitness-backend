import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Lock, Locks } from '@nestjs/locks';
import { type Counter, metrics } from '@opentelemetry/api';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Environment } from '../config/environment.js';

/** How long a cache call may take before the read falls back to PostgreSQL. */
const CACHE_TIMEOUT_MS = 250;

/**
 * The load lock (section 8.1): how long the lock lives if its holder dies, and how long the other
 * callers wait for its holder's value before they load it themselves.
 */
const LOAD_LOCK_TTL_MS = 10_000;

/** How a read was answered: from the cache, by loading it, by waiting for another caller's load, with the cache off, or with the cache unreachable. */
type ReadResult = 'hit' | 'load' | 'wait' | 'off' | 'unavailable';

/**
 * Cache-aside for read models, on Redis (section 8). A cache failure never fails a read: it logs a
 * warning and reads from PostgreSQL. Forgetting keys does fail, so the invalidation handler is
 * retried.
 *
 * On a miss, with READ_CACHE_LOCK=on (the default), one caller per key loads it, on any instance:
 * the one holding the key's load lock. The others wait for its value, instead of all reading the
 * same thing from PostgreSQL at once (a cache stampede). READ_CACHE=off reads PostgreSQL every
 * time, to compare.
 */
@Injectable()
export class ReadCache {
  private readonly logger = new Logger(ReadCache.name);
  private readonly enabled: boolean;
  private readonly locked: boolean;
  private readonly reads: Counter = metrics.getMeter('training-progress.read-cache').createCounter('read_cache.reads', {
    description: 'Reads of cached read models, by read model and by how they were answered: hit, load (from PostgreSQL), wait (for another caller’s load), off, unavailable',
  });
  private lastWarning = 0;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly locks: Locks,
    config: ConfigService<Environment, true>,
  ) {
    this.enabled = config.get('READ_CACHE', { infer: true }) !== 'off';
    this.locked = config.get('READ_CACHE_LOCK', { infer: true }) !== 'off';
    // @nestjs/cache-manager may wrap the Redis store in another Keyv: a store that emits `error`
    // without a listener would crash the process when Redis drops the connection.
    for (const store of cache.stores ?? []) {
      store.on('error', (error: unknown) => this.warn(`Cache unavailable, reading from PostgreSQL: ${(error as Error)?.message ?? error}`));
    }
  }

  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return this.counted(key, 'off', load);
    }
    let cached: T | undefined;
    try {
      cached = await this.read<T>(key);
    } catch (error) {
      this.warn(`Cache read of ${key} failed, reading from PostgreSQL: ${(error as Error).message}`);
      return this.counted(key, 'unavailable', load); // the cache is down: don't wait for a write that fails too
    }
    if (cached !== undefined) {
      this.count(key, 'hit');
      return cached;
    }
    return this.locked ? this.loadOnce(key, ttlMs, load) : this.loadAndStore(key, ttlMs, load);
  }

  /** Deletes the keys. Throws when the cache is unreachable, so the caller can retry. */
  async forget(keys: readonly string[]): Promise<void> {
    await withTimeout(this.cache.mdel([...keys]));
  }

  /** A round trip through the cache, for the health check. */
  async ping(): Promise<void> {
    const key = 'health:ping';
    await withTimeout(this.cache.set(key, Date.now(), 5000));
    await withTimeout(this.cache.get(key));
  }

  /**
   * The holder of the key's load lock loads it; the others look for its value in the cache, more
   * and more slowly (10 ms up to 100 ms), and try the lock again in case the holder failed. Past
   * LOAD_LOCK_TTL_MS they load it themselves. Without the lock store (Redis down), every caller loads.
   */
  private async loadOnce<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const giveUpAt = Date.now() + LOAD_LOCK_TTL_MS;
    for (let attempt = 0; ; attempt++) {
      let lock: Lock | null;
      try {
        // Like a cache call, bounded: a Redis that stops answering mustn't hold the read.
        lock = await this.locks.acquire(`read-cache:${key}`, { ttl: LOAD_LOCK_TTL_MS, signal: AbortSignal.timeout(CACHE_TIMEOUT_MS) });
      } catch (error) {
        this.warn(`Load lock on ${key} unavailable, reading from PostgreSQL: ${(error as Error).message}`);
        return this.loadAndStore(key, ttlMs, load);
      }
      if (lock) {
        try {
          // The previous holder may have stored it between this caller's miss and its lock.
          const stored = await this.storedValue<T>(key);
          if (stored !== undefined) {
            this.count(key, 'wait');
            return stored;
          }
          return await this.loadAndStore(key, ttlMs, load);
        } finally {
          // If Redis doesn't answer, the lock expires after its ttl.
          await withTimeout(lock.release()).catch(() => false);
        }
      }
      await sleep(Math.min(10 * 2 ** attempt, 100));
      const stored = await this.storedValue<T>(key);
      if (stored !== undefined) {
        this.count(key, 'wait');
        return stored;
      }
      if (Date.now() >= giveUpAt) {
        return this.loadAndStore(key, ttlMs, load);
      }
    }
  }

  private async loadAndStore<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const value = await this.counted(key, 'load', load);
    try {
      await withTimeout(this.cache.set(key, value, ttlMs));
    } catch (error) {
      this.warn(`Cache write of ${key} failed: ${(error as Error).message}`);
    }
    return value;
  }

  private async read<T>(key: string): Promise<T | undefined> {
    const cached = await withTimeout(this.cache.get<T>(key));
    return cached === null ? undefined : cached;
  }

  /** The cached value, or undefined on a miss or a cache failure. */
  private storedValue<T>(key: string): Promise<T | undefined> {
    return this.read<T>(key).catch(() => undefined);
  }

  private counted<T>(key: string, result: ReadResult, load: () => Promise<T>): Promise<T> {
    this.count(key, result);
    return load();
  }

  /** The read model is the key's first part (cache-keys.ts): streak, progress-summary, personal-records. */
  private count(key: string, result: ReadResult): void {
    this.reads.add(1, { 'read_cache.read_model': key.split(':', 1)[0], 'read_cache.result': result });
  }

  /** At most one warning every 10 seconds while Redis is down. */
  private warn(message: string): void {
    if (Date.now() - this.lastWarning > 10_000) {
      this.lastWarning = Date.now();
      this.logger.warn(message);
    }
  }
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`cache timed out after ${CACHE_TIMEOUT_MS} ms`)), CACHE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
