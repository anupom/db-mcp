import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pg from 'pg';

vi.mock('../../config.js', () => {
  return {
    getConfig: () => ({
      DATA_DIR: '/tmp',
      LOG_LEVEL: 'silent',
    }),
  };
});

vi.mock('../../utils/logger.js', () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: () => noopLogger,
  };
  return { getLogger: () => noopLogger };
});

import { DatabaseStore, initializeDatabaseStore, resetDatabaseStore } from '../../registry/pg-store.js';
import { ApiKeyStore } from '../api-key-store.js';
import * as crypto from 'crypto';

const TEST_SCHEMA = 'dbmcp';

describe('ApiKeyStore', () => {
  let pool: pg.Pool;
  let store: ApiKeyStore;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_URL
      || `postgresql://${process.env.POSTGRES_USER ?? 'cube'}:${process.env.POSTGRES_PASSWORD ?? 'cube'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'ecom'}`;
    pool = new pg.Pool({ connectionString });
    const pgStore = new DatabaseStore(pool);
    await pgStore.initialize();
    resetDatabaseStore();
    await initializeDatabaseStore();
    store = new ApiKeyStore();
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.api_keys`);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.api_keys`);
    await pool.end();
    resetDatabaseStore();
  });

  it('creates an API key and returns the raw key once', async () => {
    const { apiKey, rawKey } = await store.create('tenant-a', 'My Key', 'user-1');

    expect(apiKey.id).toBeDefined();
    expect(apiKey.tenantId).toBe('tenant-a');
    expect(apiKey.name).toBe('My Key');
    expect(apiKey.createdBy).toBe('user-1');
    expect(apiKey.revokedAt).toBeNull();
    expect(rawKey).toMatch(/^dbmcp_/);
    expect(apiKey.keyPrefix).toBe(rawKey.substring(0, 12));
  });

  it('looks up a key by its SHA-256 hash', async () => {
    const { rawKey } = await store.create('tenant-a', 'Test Key', 'user-1');
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const found = await store.getByHash(hash);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test Key');
    expect(found!.tenantId).toBe('tenant-a');
  });

  it('returns null for unknown hash', async () => {
    const found = await store.getByHash('nonexistent-hash');
    expect(found).toBeNull();
  });

  it('lists keys by tenant', async () => {
    await store.create('tenant-a', 'Key 1', 'user-1');
    await store.create('tenant-a', 'Key 2', 'user-1');
    await store.create('tenant-b', 'Key 3', 'user-2');

    const tenantAKeys = await store.listByTenant('tenant-a');
    expect(tenantAKeys).toHaveLength(2);
    expect(tenantAKeys.every(k => k.tenantId === 'tenant-a')).toBe(true);

    const tenantBKeys = await store.listByTenant('tenant-b');
    expect(tenantBKeys).toHaveLength(1);
    expect(tenantBKeys[0].name).toBe('Key 3');
  });

  it('revokes a key', async () => {
    const { apiKey, rawKey } = await store.create('tenant-a', 'Revocable', 'user-1');

    const revoked = await store.revoke(apiKey.id, 'tenant-a');
    expect(revoked).toBe(true);

    // Revoked key should not be found by hash
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const found = await store.getByHash(hash);
    expect(found).toBeNull();

    // But it should still show in the list (with revokedAt set)
    const keys = await store.listByTenant('tenant-a');
    expect(keys).toHaveLength(1);
    expect(keys[0].revokedAt).not.toBeNull();
  });

  it('revoke fails for wrong tenant', async () => {
    const { apiKey } = await store.create('tenant-a', 'Key', 'user-1');
    const revoked = await store.revoke(apiKey.id, 'tenant-b');
    expect(revoked).toBe(false);
  });

  it('revoke fails for already-revoked key', async () => {
    const { apiKey } = await store.create('tenant-a', 'Key', 'user-1');
    await store.revoke(apiKey.id, 'tenant-a');
    const secondRevoke = await store.revoke(apiKey.id, 'tenant-a');
    expect(secondRevoke).toBe(false);
  });

  it('touches lastUsedAt', async () => {
    const { apiKey, rawKey } = await store.create('tenant-a', 'Key', 'user-1');
    expect(apiKey.lastUsedAt).toBeNull();

    await store.touchLastUsed(apiKey.id);

    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const found = await store.getByHash(hash);
    expect(found!.lastUsedAt).not.toBeNull();
  });

  it('generates unique keys', async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const { rawKey } = await store.create('tenant-a', `Key ${i}`, 'user-1');
      keys.add(rawKey);
    }
    expect(keys.size).toBe(10);
  });
});
