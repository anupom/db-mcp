import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock getConfig before importing store
vi.mock('../../config.js', () => {
  let dataDir = '/tmp';
  return {
    getConfig: () => ({
      DATA_DIR: dataDir,
      CUBE_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      ADMIN_SECRET: undefined, // no encryption in tests
      LOG_LEVEL: 'silent',
    }),
    __setDataDir: (dir: string) => { dataDir = dir; },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __setDataDir } = await import('../../config.js') as any;

import { DatabaseStore } from '../store.js';
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

describe('DatabaseStore — tenant isolation', () => {
  let tmpDir: string;
  let store: DatabaseStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dbmcp-test-'));
    __setDataDir(tmpDir);
    store = new DatabaseStore(join(tmpDir, 'config.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -- create --

  it('creates a database without tenantId (self-hosted)', () => {
    const db = store.create(makeConfig('db1'));
    expect(db.id).toBe('db1');
    expect(db.tenantId).toBeUndefined();
  });

  it('creates a database with tenantId (SaaS)', () => {
    const db = store.create(makeConfig('db1'), 'tenant-a');
    expect(db.id).toBe('db1');
    expect(db.tenantId).toBe('tenant-a');
  });

  // -- get --

  it('get without tenantId returns any database (self-hosted)', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const db = store.get('db1');
    expect(db).not.toBeNull();
    expect(db!.id).toBe('db1');
  });

  it('get with matching tenantId returns the database', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const db = store.get('db1', 'tenant-a');
    expect(db).not.toBeNull();
  });

  it('get with wrong tenantId returns null', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const db = store.get('db1', 'tenant-b');
    expect(db).toBeNull();
  });

  // -- list --

  it('list without tenantId returns all databases', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    store.create(makeConfig('db2'), 'tenant-b');
    store.create(makeConfig('db3'));

    const all = store.list();
    expect(all).toHaveLength(3);
  });

  it('list with tenantId filters to that tenant', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    store.create(makeConfig('db2'), 'tenant-a');
    store.create(makeConfig('db3'), 'tenant-b');

    const tenantA = store.list('tenant-a');
    expect(tenantA).toHaveLength(2);
    expect(tenantA.every(d => d.tenantId === 'tenant-a')).toBe(true);

    const tenantB = store.list('tenant-b');
    expect(tenantB).toHaveLength(1);
    expect(tenantB[0].id).toBe('db3');
  });

  // -- listActive --

  it('listActive filters by tenant and status', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    store.create(makeConfig('db2'), 'tenant-a');
    store.create(makeConfig('db3'), 'tenant-b');

    store.updateStatus('db1', 'active');
    store.updateStatus('db3', 'active');

    const activeTenantA = store.listActive('tenant-a');
    expect(activeTenantA).toHaveLength(1);
    expect(activeTenantA[0].id).toBe('db1');
  });

  // -- update --

  it('update with matching tenantId succeeds', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const updated = store.update({ id: 'db1', name: 'Updated' }, 'tenant-a');
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Updated');
  });

  it('update with wrong tenantId returns null', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const updated = store.update({ id: 'db1', name: 'Updated' }, 'tenant-b');
    expect(updated).toBeNull();
  });

  // -- delete --

  it('delete with matching tenantId succeeds', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const deleted = store.delete('db1', 'tenant-a');
    expect(deleted).toBe(true);
    expect(store.get('db1')).toBeNull();
  });

  it('delete with wrong tenantId fails', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const deleted = store.delete('db1', 'tenant-b');
    expect(deleted).toBe(false);
    expect(store.get('db1')).not.toBeNull();
  });

  // -- updateStatus --

  it('updateStatus with matching tenantId succeeds', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const result = store.updateStatus('db1', 'active', undefined, 'tenant-a');
    expect(result).toBe(true);
    expect(store.get('db1')!.status).toBe('active');
  });

  it('updateStatus with wrong tenantId fails', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    const result = store.updateStatus('db1', 'active', undefined, 'tenant-b');
    expect(result).toBe(false);
    expect(store.get('db1')!.status).toBe('inactive');
  });

  // -- exists --

  it('exists without tenantId matches any', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    expect(store.exists('db1')).toBe(true);
  });

  it('exists with matching tenantId returns true', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    expect(store.exists('db1', 'tenant-a')).toBe(true);
  });

  it('exists with wrong tenantId returns false', () => {
    store.create(makeConfig('db1'), 'tenant-a');
    expect(store.exists('db1', 'tenant-b')).toBe(false);
  });

  // -- slug --

  it('create persists slug from config', () => {
    const db = store.create(makeConfig('scoped-id-123', { slug: 'analytics' }), 'tenant-a');
    expect(db.id).toBe('scoped-id-123');
    expect(db.slug).toBe('analytics');
  });

  it('create defaults slug to id when not provided', () => {
    const db = store.create(makeConfig('mydb'));
    expect(db.slug).toBe('mydb');
  });

  it('list returns slug', () => {
    store.create(makeConfig('scoped-id', { slug: 'analytics' }), 'tenant-a');
    const list = store.list('tenant-a');
    expect(list[0].slug).toBe('analytics');
  });
});

describe('scopeDatabaseId', () => {
  it('returns slug unchanged when no tenantId', () => {
    expect(scopeDatabaseId('analytics')).toBe('analytics');
  });

  it('appends 8-char hash when tenantId is provided', () => {
    const result = scopeDatabaseId('analytics', 'tenant-a');
    expect(result).toMatch(/^analytics-[a-f0-9]{8}$/);
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
  let tmpDir: string;
  let store: DatabaseStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dbmcp-test-'));
    __setDataDir(tmpDir);
    store = new DatabaseStore(join(tmpDir, 'config.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('two tenants can use the same slug without PK collision', () => {
    const idA = scopeDatabaseId('analytics', 'tenant-a');
    const idB = scopeDatabaseId('analytics', 'tenant-b');

    store.create(makeConfig(idA, { slug: 'analytics' }), 'tenant-a');
    store.create(makeConfig(idB, { slug: 'analytics' }), 'tenant-b');

    expect(store.exists(idA)).toBe(true);
    expect(store.exists(idB)).toBe(true);

    const listA = store.list('tenant-a');
    const listB = store.list('tenant-b');
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(listA[0].slug).toBe('analytics');
    expect(listB[0].slug).toBe('analytics');
  });

  it('scoped IDs are globally unique', () => {
    const idA = scopeDatabaseId('db', 'tenant-a');
    const idB = scopeDatabaseId('db', 'tenant-b');
    expect(idA).not.toBe(idB);

    store.create(makeConfig(idA, { slug: 'db' }), 'tenant-a');
    // Should not throw UNIQUE constraint error
    expect(() => store.create(makeConfig(idB, { slug: 'db' }), 'tenant-b')).not.toThrow();
  });
});
