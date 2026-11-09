import type { Cache } from '@nestjs/cache-manager';
import type { ConfigService } from '@nestjs/config';
import { type LockStore, Locks, LocksModule, LocksStorage } from '@nestjs/locks';
import { Test } from '@nestjs/testing';
import { createCache } from 'cache-manager';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Environment } from '../config/environment.js';
import { ReadCache } from './read-cache.js';

function cache(overrides: Partial<Cache>): Cache {
  return { stores: [], get: vi.fn(async () => undefined), set: vi.fn(async () => true), mdel: vi.fn(async () => true), ...overrides } as unknown as Cache;
}

function config(values: Partial<Pick<Environment, 'READ_CACHE' | 'READ_CACHE_LOCK'>> = {}) {
  return { get: (key: keyof typeof values) => values[key] } as unknown as ConfigService<Environment, true>;
}

/** A load of `ms` that counts its calls, like a slow streak query. */
function slowLoad<T>(value: T, ms = 50) {
  return vi.fn(async () => {
    await sleep(ms);
    return value;
  });
}

describe('ReadCache', () => {
  let locks: Locks;

  beforeAll(async () => {
    // In memory: one process, which is all these cases need; RedisLockStore's spec covers Redis.
    const moduleRef = await Test.createTestingModule({ imports: [LocksModule.forRoot()] }).compile();
    await moduleRef.init();
    locks = moduleRef.get(Locks);
  });

  it('returns a cached value without loading', async () => {
    const load = vi.fn();
    const readCache = new ReadCache(cache({ get: vi.fn(async () => ({ streak: 3 })) as Cache['get'] }), locks, config());

    await expect(readCache.getOrLoad('streak:ada', 1000, load)).resolves.toEqual({ streak: 3 });
    expect(load).not.toHaveBeenCalled();
  });

  it('loads and caches on a miss', async () => {
    const store = cache({});
    const readCache = new ReadCache(store, locks, config());

    await expect(readCache.getOrLoad('streak:ada', 1000, async () => 4)).resolves.toBe(4);
    expect(store.set).toHaveBeenCalledWith('streak:ada', 4, 1000);
  });

  it('reads from the source when the cache fails or hangs', async () => {
    const failing = new ReadCache(cache({ get: vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))) as Cache['get'] }), locks, config());
    const hanging = new ReadCache(
      cache({ get: vi.fn(() => new Promise(() => {})) as Cache['get'], set: vi.fn(() => new Promise(() => {})) as Cache['set'] }),
      locks,
      config(),
    );

    await expect(failing.getOrLoad('streak:ada', 1000, async () => 5)).resolves.toBe(5);
    await expect(hanging.getOrLoad('streak:ada', 1000, async () => 6)).resolves.toBe(6);
  });

  it('fails to forget when the cache fails, so invalidation is retried', async () => {
    const readCache = new ReadCache(cache({ mdel: vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))) as Cache['mdel'] }), locks, config());

    await expect(readCache.forget(['streak:ada'])).rejects.toThrow('ECONNREFUSED');
  });

  describe('a cache stampede: many readers miss the same key at once', () => {
    it('loads it once under the load lock; the others wait for its value', async () => {
      const readCache = new ReadCache(createCache(), locks, config());
      const load = slowLoad(7);

      const streaks = await Promise.all(Array.from({ length: 20 }, () => readCache.getOrLoad('streak:ada', 60_000, load)));

      expect(streaks).toEqual(Array(20).fill(7));
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('loads it once per key', async () => {
      const readCache = new ReadCache(createCache(), locks, config());
      const load = slowLoad(7);

      await Promise.all(['ada', 'grace', 'ada', 'grace'].map((member) => readCache.getOrLoad(`streak:${member}`, 60_000, load)));

      expect(load).toHaveBeenCalledTimes(2);
    });

    it('with READ_CACHE_LOCK=off, every reader loads it', async () => {
      const readCache = new ReadCache(createCache(), locks, config({ READ_CACHE_LOCK: 'off' }));
      const load = slowLoad(7);

      await Promise.all(Array.from({ length: 20 }, () => readCache.getOrLoad('streak:ada', 60_000, load)));

      expect(load).toHaveBeenCalledTimes(20);
    });

    it('when the holder fails to load it, the next reader takes the lock and loads it', async () => {
      const readCache = new ReadCache(createCache(), locks, config());
      const load = vi.fn().mockRejectedValueOnce(new Error('canceling statement due to statement timeout')).mockResolvedValue(7);

      const [first, ...others] = await Promise.allSettled(Array.from({ length: 5 }, () => readCache.getOrLoad('streak:ada', 60_000, load)));

      expect(first).toMatchObject({ status: 'rejected' });
      expect(others).toEqual(Array(4).fill({ status: 'fulfilled', value: 7 }));
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('when the lock store stops answering, the reader gives up on the lock after 250 ms and loads it', async () => {
      const silent: LockStore = { acquire: () => new Promise(() => {}), renew: async () => false, release: async () => false };
      const moduleRef = await Test.createTestingModule({
        imports: [LocksModule.forRoot()],
        providers: [{ provide: 'silent', inject: [LocksStorage], useFactory: (storage: LocksStorage) => storage.registerSource(silent) }],
      }).compile();
      await moduleRef.init();
      const readCache = new ReadCache(createCache(), moduleRef.get(Locks), config());
      const startedAt = Date.now();

      await expect(readCache.getOrLoad('streak:ada', 60_000, async () => 7)).resolves.toBe(7);
      expect(Date.now() - startedAt).toBeLessThan(1000);
    });

    it('without the lock store (Redis down), every reader loads it', async () => {
      const unavailable = { acquire: vi.fn(async () => Promise.reject(new Error('The client is closed'))) } as unknown as Locks;
      const readCache = new ReadCache(createCache(), unavailable, config());
      const load = slowLoad(7);

      await Promise.all(Array.from({ length: 3 }, () => readCache.getOrLoad('streak:ada', 60_000, load)));

      expect(load).toHaveBeenCalledTimes(3);
    });
  });

  it('with READ_CACHE=off, loads every read and leaves the cache alone', async () => {
    const store = cache({});
    const readCache = new ReadCache(store, locks, config({ READ_CACHE: 'off' }));
    const load = vi.fn(async () => 7);

    await readCache.getOrLoad('streak:ada', 1000, load);
    await readCache.getOrLoad('streak:ada', 1000, load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });
});
