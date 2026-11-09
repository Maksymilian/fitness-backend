import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { StartupTolerantPostgresOutboxStore } from './startup-tolerant-postgres-outbox-store.js';

/** A store on a database that never connects: its `select 1` answers as `ping` says. */
function store(ping: () => Promise<unknown>) {
  const db = drizzle({ connection: 'postgres://nobody@localhost:1/none' });
  vi.spyOn(db, 'execute').mockImplementation(ping as never);
  return new StartupTolerantPostgresOutboxStore(db, undefined as never);
}

describe('StartupTolerantPostgresOutboxStore', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts without checking its schema while PostgreSQL is unreachable', async () => {
    const schemaCheck = vi.spyOn(PostgresOutboxStore.prototype, 'onModuleInit').mockResolvedValue();

    await expect(store(() => Promise.reject(new Error('connect ECONNREFUSED'))).onModuleInit()).resolves.toBeUndefined();
    expect(schemaCheck).not.toHaveBeenCalled();
  });

  it('checks its schema at startup when PostgreSQL answers', async () => {
    const schemaCheck = vi.spyOn(PostgresOutboxStore.prototype, 'onModuleInit').mockResolvedValue();

    await store(() => Promise.resolve()).onModuleInit();
    expect(schemaCheck).toHaveBeenCalledOnce();
  });

  it('fails the startup when PostgreSQL answers with a schema that is behind', async () => {
    vi.spyOn(PostgresOutboxStore.prototype, 'onModuleInit').mockRejectedValue(new Error('schema behind'));

    await expect(store(() => Promise.resolve()).onModuleInit()).rejects.toThrow('schema behind');
  });
});
