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
});
