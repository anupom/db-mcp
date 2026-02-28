import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pg from 'pg';

// Mock getConfig before importing store
vi.mock('../../config.js', () => {
  return {
    getConfig: () => ({
      DATA_DIR: '/tmp/dbmcp-test',
      CUBE_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      ADMIN_SECRET: undefined,
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

import { DatabaseStore } from '../pg-store.js';
import { scopeDatabaseId, defaultDatabaseId } from '../manager.js';
import type { CreateDatabaseConfig } from '../types.js';

function makeConfig(id: string, overrides?: Partial<CreateDatabaseConfig>): CreateDatabaseConfig {
  return {
    id,
    name: `Database ${id}`,
    connection: { type: 'postgres', host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
    maxLimit: 1000,
    denyMembers: [],
    defaultSegments: [],
    returnSql: false,
    ...overrides,
  };
}

// Test schema to isolate test data
const TEST_SCHEMA = 'dbmcp';

describe('DatabaseStore — tenant isolation', () => {
  let pool: pg.Pool;
  let store: DatabaseStore;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_URL
      || `postgresql://${process.env.POSTGRES_USER ?? 'cube'}:${process.env.POSTGRES_PASSWORD ?? 'cube'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'ecom'}`;
    pool = new pg.Pool({ connectionString });
    store = new DatabaseStore(pool);
    await store.initialize();
    // Clean up test data
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.databases`);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.databases`);
    await pool.end();
  });

  // -- create --

  it('creates a database without tenantId (self-hosted)', async () => {
    const db = await store.create(makeConfig('db1'));
    expect(db.id).toBe('db1');
    expect(db.tenantId).toBeUndefined();
  });

  it('creates a database with tenantId (SaaS)', async () => {
    const db = await store.create(makeConfig('db1'), 'tenant-a');
    expect(db.id).toBe('db1');
    expect(db.tenantId).toBe('tenant-a');
  });

  // -- get --

  it('get without tenantId returns any database (self-hosted)', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const db = await store.get('db1');
    expect(db).not.toBeNull();
    expect(db!.id).toBe('db1');
  });

  it('get with matching tenantId returns the database', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const db = await store.get('db1', 'tenant-a');
    expect(db).not.toBeNull();
  });

  it('get with wrong tenantId returns null', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const db = await store.get('db1', 'tenant-b');
    expect(db).toBeNull();
  });

  // -- list --

  it('list without tenantId returns all databases', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    await store.create(makeConfig('db2'), 'tenant-b');
    await store.create(makeConfig('db3'));

    const all = await store.list();
    expect(all).toHaveLength(3);
  });

  it('list with tenantId filters to that tenant', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    await store.create(makeConfig('db2'), 'tenant-a');
    await store.create(makeConfig('db3'), 'tenant-b');

    const tenantA = await store.list('tenant-a');
    expect(tenantA).toHaveLength(2);
    expect(tenantA.every(d => d.tenantId === 'tenant-a')).toBe(true);

    const tenantB = await store.list('tenant-b');
    expect(tenantB).toHaveLength(1);
    expect(tenantB[0].id).toBe('db3');
  });

  // -- listActive --

  it('listActive filters by tenant and status', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    await store.create(makeConfig('db2'), 'tenant-a');
    await store.create(makeConfig('db3'), 'tenant-b');

    await store.updateStatus('db1', 'active');
    await store.updateStatus('db3', 'active');

    const activeTenantA = await store.listActive('tenant-a');
    expect(activeTenantA).toHaveLength(1);
    expect(activeTenantA[0].id).toBe('db1');
  });

  // -- update --

  it('update with matching tenantId succeeds', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const updated = await store.update({ id: 'db1', name: 'Updated' }, 'tenant-a');
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Updated');
  });

  it('update with wrong tenantId returns null', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const updated = await store.update({ id: 'db1', name: 'Updated' }, 'tenant-b');
    expect(updated).toBeNull();
  });

  // -- delete --

  it('delete with matching tenantId succeeds', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const deleted = await store.delete('db1', 'tenant-a');
    expect(deleted).toBe(true);
    expect(await store.get('db1')).toBeNull();
  });

  it('delete with wrong tenantId fails', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const deleted = await store.delete('db1', 'tenant-b');
    expect(deleted).toBe(false);
    expect(await store.get('db1')).not.toBeNull();
  });

  // -- updateStatus --

  it('updateStatus with matching tenantId succeeds', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const result = await store.updateStatus('db1', 'active', undefined, 'tenant-a');
    expect(result).toBe(true);
    expect((await store.get('db1'))!.status).toBe('active');
  });

  it('updateStatus with wrong tenantId fails', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    const result = await store.updateStatus('db1', 'active', undefined, 'tenant-b');
    expect(result).toBe(false);
    expect((await store.get('db1'))!.status).toBe('inactive');
  });

  // -- exists --

  it('exists without tenantId matches any', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    expect(await store.exists('db1')).toBe(true);
  });

  it('exists with matching tenantId returns true', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    expect(await store.exists('db1', 'tenant-a')).toBe(true);
  });

  it('exists with wrong tenantId returns false', async () => {
    await store.create(makeConfig('db1'), 'tenant-a');
    expect(await store.exists('db1', 'tenant-b')).toBe(false);
  });

  // -- slug --

  it('create persists slug from config', async () => {
    const db = await store.create(makeConfig('scoped-id-123', { slug: 'analytics' }), 'tenant-a');
    expect(db.id).toBe('scoped-id-123');
    expect(db.slug).toBe('analytics');
  });

  it('create defaults slug to id when not provided', async () => {
    const db = await store.create(makeConfig('mydb'));
    expect(db.slug).toBe('mydb');
  });

  it('list returns slug', async () => {
    await store.create(makeConfig('scoped-id', { slug: 'analytics' }), 'tenant-a');
    const list = await store.list('tenant-a');
    expect(list[0].slug).toBe('analytics');
  });
});

describe('scopeDatabaseId', () => {
  it('returns slug unchanged when no tenantId', () => {
    expect(scopeDatabaseId('analytics')).toBe('analytics');
  });

  it('appends 12-char hash when tenantId is provided', () => {
    const result = scopeDatabaseId('analytics', 'tenant-a');
    expect(result).toMatch(/^analytics-[a-f0-9]{12}$/);
  });

  it('produces different IDs for different tenants', () => {
    const a = scopeDatabaseId('analytics', 'tenant-a');
    const b = scopeDatabaseId('analytics', 'tenant-b');
    expect(a).not.toBe(b);
  });

  it('is consistent with defaultDatabaseId', () => {
    expect(scopeDatabaseId('default', 'org_123')).toBe(defaultDatabaseId('org_123'));
  });

  it('is deterministic', () => {
    const a = scopeDatabaseId('mydb', 'tenant-x');
    const b = scopeDatabaseId('mydb', 'tenant-x');
    expect(a).toBe(b);
  });
});

describe('slug-based scoping — no PK collision', () => {
  let pool: pg.Pool;
  let store: DatabaseStore;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_URL
      || `postgresql://${process.env.POSTGRES_USER ?? 'cube'}:${process.env.POSTGRES_PASSWORD ?? 'cube'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'ecom'}`;
    pool = new pg.Pool({ connectionString });
    store = new DatabaseStore(pool);
    await store.initialize();
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.databases`);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.databases`);
    await pool.end();
  });

  it('two tenants can use the same slug without PK collision', async () => {
    const idA = scopeDatabaseId('analytics', 'tenant-a');
    const idB = scopeDatabaseId('analytics', 'tenant-b');

    await store.create(makeConfig(idA, { slug: 'analytics' }), 'tenant-a');
    await store.create(makeConfig(idB, { slug: 'analytics' }), 'tenant-b');

    expect(await store.exists(idA)).toBe(true);
    expect(await store.exists(idB)).toBe(true);

    const listA = await store.list('tenant-a');
    const listB = await store.list('tenant-b');
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(listA[0].slug).toBe('analytics');
    expect(listB[0].slug).toBe('analytics');
  });

  it('scoped IDs are globally unique', async () => {
    const idA = scopeDatabaseId('db', 'tenant-a');
    const idB = scopeDatabaseId('db', 'tenant-b');
    expect(idA).not.toBe(idB);

    await store.create(makeConfig(idA, { slug: 'db' }), 'tenant-a');
    // Should not throw constraint error
    await expect(store.create(makeConfig(idB, { slug: 'db' }), 'tenant-b')).resolves.toBeDefined();
  });
});
