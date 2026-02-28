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
import { TenantStore } from '../tenant-store.js';

const TEST_SCHEMA = 'dbmcp';

describe('TenantStore', () => {
  let pool: pg.Pool;
  let store: TenantStore;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_URL
      || `postgresql://${process.env.POSTGRES_USER ?? 'cube'}:${process.env.POSTGRES_PASSWORD ?? 'cube'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'ecom'}`;
    pool = new pg.Pool({ connectionString });
    const pgStore = new DatabaseStore(pool);
    await pgStore.initialize();
    // Inject the store for TenantStore to use
    resetDatabaseStore();
    await initializeDatabaseStore();
    store = new TenantStore();
    // Clean up test data
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.tenants`);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.tenants`);
    await pool.end();
    resetDatabaseStore();
  });

  it('creates a tenant and retrieves by id', async () => {
    const tenant = await store.create('org_123', 'acme');
    expect(tenant.id).toBe('org_123');
    expect(tenant.slug).toBe('acme');
    expect(tenant.name).toBeNull();

    const found = await store.getById('org_123');
    expect(found).not.toBeNull();
    expect(found!.slug).toBe('acme');
  });

  it('creates a tenant with name', async () => {
    const tenant = await store.create('org_123', 'acme', 'Acme Corp');
    expect(tenant.name).toBe('Acme Corp');
  });

  it('retrieves by slug', async () => {
    await store.create('org_123', 'acme');
    const found = await store.getBySlug('acme');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('org_123');
  });

  it('returns null for non-existent id', async () => {
    expect(await store.getById('nonexistent')).toBeNull();
  });

  it('returns null for non-existent slug', async () => {
    expect(await store.getBySlug('nonexistent')).toBeNull();
  });

  it('enforces slug uniqueness', async () => {
    await store.create('org_1', 'acme');
    await expect(store.create('org_2', 'acme')).rejects.toThrow();
  });

  it('enforces slug validation on create', async () => {
    await expect(store.create('org_1', 'AB')).rejects.toThrow(/Invalid slug/);
    await expect(store.create('org_1', '1abc')).rejects.toThrow(/Invalid slug/);
  });

  it('checks slug existence', async () => {
    await store.create('org_1', 'acme');
    expect(await store.slugExists('acme')).toBe(true);
    expect(await store.slugExists('other')).toBe(false);
  });

  it('updates slug', async () => {
    await store.create('org_1', 'acme');
    const updated = await store.updateSlug('org_1', 'acme-inc');
    expect(updated).not.toBeNull();
    expect(updated!.slug).toBe('acme-inc');

    // Old slug should not be found
    expect(await store.getBySlug('acme')).toBeNull();
    // New slug should be found
    expect(await store.getBySlug('acme-inc')).not.toBeNull();
  });

  it('updateSlug validates new slug', async () => {
    await store.create('org_1', 'acme');
    await expect(store.updateSlug('org_1', 'AB')).rejects.toThrow(/Invalid slug/);
  });

  it('updateSlug returns null for non-existent tenant', async () => {
    expect(await store.updateSlug('nonexistent', 'acme')).toBeNull();
  });
});
