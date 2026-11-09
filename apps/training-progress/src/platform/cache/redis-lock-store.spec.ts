import type { ConfigService } from '@nestjs/config';
import { LocksStorage } from '@nestjs/locks';
import { lockStoreContract } from '@nestjs/locks/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { Environment } from '../config/environment.js';
import { RedisLockStore } from './redis-lock-store.js';

/**
 * `@nestjs/locks`' LockStore contract, the races included, against a real Redis (Testcontainers,
 * the image compose.yaml also runs). The expiry cases wait in real time (about 25 seconds): the
 * store expires locks on Redis's clock.
 */
describe('RedisLockStore, the LockStore contract', () => {
  let container: StartedRedisContainer;
  let pool: RedisLockStore[];
  let next = 0;

  beforeAll(async () => {
    container = await new RedisContainer('redis:8-alpine').start();
    const config = { get: () => container.getConnectionUrl() } as unknown as ConfigService<Environment, true>;
    // Several connections, so the calls really overlap.
    pool = Array.from({ length: 8 }, () => new RedisLockStore(config, new LocksStorage()));
    for (const store of pool) {
      store.onModuleInit();
      await store.connected();
    }
  }, 60_000);

  afterAll(async () => {
    await Promise.all(pool.map((store) => store.onApplicationShutdown()));
    await container.stop();
  });

  for (const contractCase of lockStoreContract(() => pool[next++ % pool.length]!, { concurrent: true })) {
    it(contractCase.name, contractCase.run, 60_000);
  }
});
