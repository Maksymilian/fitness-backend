import { Logger } from '@nestjs/common';
import { createKeyv } from '@keyv/redis';
import type { Keyv } from 'keyv';

const logger = new Logger('RedisStore');

/**
 * The cache's Redis store. A dropped connection must never take the service down: errors are
 * logged here, the cache calls fail, and the reads fall back to PostgreSQL. The client reconnects
 * in the background.
 */
export function redisStore(url: string): Keyv {
  const keyv = createKeyv(
    {
      url,
      // Fail at once while disconnected, instead of queueing commands until Redis is back.
      disableOfflineQueue: true,
      socket: { connectTimeout: 1000, reconnectStrategy: (retries: number) => Math.min(retries * 200, 5000) },
    },
    { throwOnErrors: true, throwOnConnectError: false },
  );
  let lastWarning = 0;
  const warn = (error: unknown) => {
    // At most one warning every 10 seconds while Redis is down.
    if (Date.now() - lastWarning > 10_000) {
      lastWarning = Date.now();
      logger.warn(`Redis unavailable, reading from PostgreSQL: ${(error as Error)?.message ?? error}`);
    }
  };
  keyv.on('error', warn);
  (keyv.store as { on?: (event: string, listener: (error: unknown) => void) => void }).on?.('error', warn);
  return keyv;
}
