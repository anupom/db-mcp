import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Track the temp dir for config mock
let tmpDir: string;

vi.mock('../../config.js', () => {
  return {
    getConfig: () => ({
      DATA_DIR: tmpDir,
      CUBE_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      CUBE_API_URL: 'http://localhost:4000/cubejs-api/v1',
      ADMIN_SECRET: undefined,
      MAX_LIMIT: 1000,
      DENY_MEMBERS: [],
      DEFAULT_SEGMENTS: [],
      RETURN_SQL: false,
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

// Mock auto-introspect (requires real DB connection)
const mockIntrospect = vi.fn().mockResolvedValue({ generated: ['orders', 'users'], failed: [] });
vi.mock('../../admin/services/auto-introspect.js', () => ({
  introspectAndGenerateCubes: (...args: unknown[]) => mockIntrospect(...args),
}));

import { DatabaseStore } from '../store.js';
import { DatabaseManager, defaultDatabaseId } from '../manager.js';

describe('initializeDefaultDatabase', () => {
  let store: DatabaseStore;
  let manager: DatabaseManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dbmcp-manager-'));
    store = new DatabaseStore(join(tmpDir, 'config.db'));
    manager = new DatabaseManager(store);
    mockIntrospect.mockReset().mockResolvedValue({ generated: ['orders', 'users'], failed: [] });
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates default database with correct scoped ID for tenant', async () => {
    const tenantId = 'org_tenant1';
    const dbId = await manager.initializeDefaultDatabase(tenantId);

    expect(dbId).toBe(defaultDatabaseId(tenantId));
    expect(dbId).toMatch(/^default-[a-f0-9]{12}$/);

    const db = manager.getDatabase(dbId, tenantId);
    expect(db).not.toBeNull();
    expect(db!.slug).toBe('default');
    expect(db!.name).toBe('Sample Database');
    expect(db!.tenantId).toBe(tenantId);
  });

  it('creates default database with id "default" for self-hosted (no tenant)', async () => {
    const dbId = await manager.initializeDefaultDatabase();

    expect(dbId).toBe('default');

    const db = manager.getDatabase(dbId);
    expect(db).not.toBeNull();
    expect(db!.slug).toBe('default');
    expect(db!.tenantId).toBeUndefined();
  });

  it('activates the database', async () => {
    const tenantId = 'org_active';
    const dbId = await manager.initializeDefaultDatabase(tenantId);

    const db = manager.getDatabase(dbId, tenantId);
    expect(db!.status).toBe('active');
  });

  it('creates data directories and catalog file', async () => {
    const tenantId = 'org_dirs';
    const dbId = await manager.initializeDefaultDatabase(tenantId);

    const baseDir = manager.getDatabaseDataDir(dbId);
    expect(existsSync(baseDir)).toBe(true);
    expect(existsSync(join(baseDir, 'cube', 'model', 'cubes'))).toBe(true);
    expect(existsSync(join(baseDir, 'agent_catalog.yaml'))).toBe(true);
  });

  it('exports cube-connections.json', async () => {
    const tenantId = 'org_export';
    await manager.initializeDefaultDatabase(tenantId);

    const connectionsPath = join(tmpDir, 'cube-connections.json');
    expect(existsSync(connectionsPath)).toBe(true);
  });

  it('uses postgres connection from env defaults', async () => {
    const dbId = await manager.initializeDefaultDatabase('org_conn');
    const db = manager.getDatabase(dbId, 'org_conn');

    expect(db!.connection.type).toBe('postgres');
    // Defaults from env or fallback values
    expect(db!.connection.host).toBe(process.env.POSTGRES_HOST ?? 'localhost');
    expect(db!.connection.port).toBe(parseInt(process.env.POSTGRES_PORT ?? '5432'));
  });

  it('calls auto-introspect after activation', async () => {
    const dbId = await manager.initializeDefaultDatabase('org_introspect');

    expect(mockIntrospect).toHaveBeenCalledWith(dbId);
  });

  it('succeeds even when auto-introspect fails', async () => {
    mockIntrospect.mockRejectedValue(new Error('Connection refused'));

    const dbId = await manager.initializeDefaultDatabase('org_introspect_fail');

    // Database should still be created and active
    const db = manager.getDatabase(dbId, 'org_introspect_fail');
    expect(db).not.toBeNull();
    expect(db!.status).toBe('active');
  });

  it('is idempotent — returns existing ID without recreating', async () => {
    const tenantId = 'org_idempotent';
    const id1 = await manager.initializeDefaultDatabase(tenantId);
    const id2 = await manager.initializeDefaultDatabase(tenantId);

    expect(id1).toBe(id2);

    // Only one database should exist
    const dbs = manager.listDatabases(tenantId);
    expect(dbs).toHaveLength(1);

    // Auto-introspect only called once (first creation)
    expect(mockIntrospect).toHaveBeenCalledTimes(1);
  });

  it('creates isolated databases for different tenants', async () => {
    const id1 = await manager.initializeDefaultDatabase('org_tenant_a');
    const id2 = await manager.initializeDefaultDatabase('org_tenant_b');

    expect(id1).not.toBe(id2);

    // Each tenant sees only their own database
    const dbsA = manager.listDatabases('org_tenant_a');
    const dbsB = manager.listDatabases('org_tenant_b');
    expect(dbsA).toHaveLength(1);
    expect(dbsB).toHaveLength(1);
    expect(dbsA[0].id).toBe(id1);
    expect(dbsB[0].id).toBe(id2);

    // Both have slug 'default'
    expect(dbsA[0].slug).toBe('default');
    expect(dbsB[0].slug).toBe('default');
  });
});
