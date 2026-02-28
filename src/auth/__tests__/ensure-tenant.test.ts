import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import pg from 'pg';

// --- Mocks ---

// Track whether isAuthEnabled returns true/false
let authEnabled = true;
vi.mock('../config.js', () => ({
  isAuthEnabled: () => authEnabled,
}));

// Mock logger
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

vi.mock('../../config.js', async () => {
  return {
    isAuthEnabled: () => authEnabled,
    getConfig: () => ({
      DATA_DIR: '/tmp',
      CUBE_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      LOG_LEVEL: 'silent',
    }),
  };
});

// Mock registry manager (fire-and-forget DB init)
const mockInitializeDefaultDatabase = vi.fn().mockResolvedValue('default-abc');
vi.mock('../../registry/manager.js', () => ({
  getDatabaseManager: () => ({
    initializeDefaultDatabase: mockInitializeDefaultDatabase,
  }),
}));

// Mock Clerk module
const mockGetOrganization = vi.fn();
vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => null,
  clerkClient: {
    organizations: {
      getOrganization: mockGetOrganization,
    },
  },
}));

// Import after mocks
import { DatabaseStore, initializeDatabaseStore, resetDatabaseStore } from '../../registry/pg-store.js';
import { ensureTenant } from '../middleware.js';
import { getTenantStore, resetTenantStore } from '../tenant-store.js';

const TEST_SCHEMA = 'dbmcp';

// --- Helpers ---

function mockReq(overrides?: Partial<Request>): Request {
  return { tenant: undefined, ...overrides } as unknown as Request;
}

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function callMiddleware(middleware: ReturnType<typeof ensureTenant>, req: Request): Promise<{ next: boolean; error?: unknown }> {
  return new Promise((resolve) => {
    const res = mockRes();
    const next: NextFunction = (err?: unknown) => {
      resolve({ next: true, error: err });
    };
    const origJson = res.json.bind(res);
    res.json = ((data: unknown) => {
      origJson(data);
      resolve({ next: false });
      return res;
    }) as typeof res.json;

    middleware(req, res, next);
  });
}

// --- Force clerkModule initialization ---
import { clerkSessionMiddleware } from '../middleware.js';

async function initClerkModule() {
  const mw = clerkSessionMiddleware();
  await new Promise<void>((resolve) => {
    mw(mockReq() as Request, mockRes() as unknown as Response, () => resolve());
  });
}

describe('ensureTenant', () => {
  let pool: pg.Pool;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_URL
      || `postgresql://${process.env.POSTGRES_USER ?? 'cube'}:${process.env.POSTGRES_PASSWORD ?? 'cube'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'ecom'}`;
    pool = new pg.Pool({ connectionString });
    const pgStore = new DatabaseStore(pool);
    await pgStore.initialize();
    resetDatabaseStore();
    await initializeDatabaseStore();
    resetTenantStore();

    authEnabled = true;
    mockGetOrganization.mockReset();
    mockInitializeDefaultDatabase.mockReset().mockResolvedValue('default-abc');

    // Clean up test tenants
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.tenants`);

    // Ensure clerkModule is initialized
    await initClerkModule();
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.tenants`);
    await pool.end();
    resetTenantStore();
    resetDatabaseStore();
  });

  it('passes through when auth is disabled', async () => {
    authEnabled = false;
    const middleware = ensureTenant();
    const req = mockReq({ tenant: { tenantId: undefined } });

    const result = await callMiddleware(middleware, req);
    expect(result.next).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('passes through when no tenantId', async () => {
    const middleware = ensureTenant();
    const req = mockReq({ tenant: { tenantId: undefined } });

    const result = await callMiddleware(middleware, req);
    expect(result.next).toBe(true);
  });

  it('creates tenant with Clerk org slug when available', async () => {
    mockGetOrganization.mockResolvedValue({
      id: 'org_test123',
      slug: 'acme-corp',
      name: 'Acme Corporation',
    });

    const middleware = ensureTenant();
    const req = mockReq({
      tenant: { tenantId: 'org_test123', userId: 'user_1' },
    });

    const result = await callMiddleware(middleware, req);

    expect(result.next).toBe(true);
    expect(req.tenant!.slug).toBe('acme-corp');

    // Verify tenant was stored with name
    const store = getTenantStore();
    const tenant = await store.getById('org_test123');
    expect(tenant).not.toBeNull();
    expect(tenant!.slug).toBe('acme-corp');
    expect(tenant!.name).toBe('Acme Corporation');
  });

  it('uses slugified org name when Clerk org has no slug', async () => {
    mockGetOrganization.mockResolvedValue({
      id: 'org_test456',
      slug: '', // empty slug
      name: 'My Great Company',
    });

    const middleware = ensureTenant();
    const req = mockReq({
      tenant: { tenantId: 'org_test456', userId: 'user_1' },
    });

    const result = await callMiddleware(middleware, req);

    expect(result.next).toBe(true);
    expect(req.tenant!.slug).toBe('my-great-company');
  });

  it('falls back to orgId-based slug when Clerk API fails', async () => {
    mockGetOrganization.mockRejectedValue(new Error('Clerk API down'));

    const middleware = ensureTenant();
    const req = mockReq({
      tenant: { tenantId: 'org_fallback99', userId: 'user_1' },
    });

    const result = await callMiddleware(middleware, req);

    expect(result.next).toBe(true);
    // org_fallback99 → org-fallback99
    expect(req.tenant!.slug).toBe('org-fallback99');
  });

  it('reuses existing tenant on subsequent requests', async () => {
    mockGetOrganization.mockResolvedValue({
      id: 'org_existing',
      slug: 'existing-org',
      name: 'Existing',
    });

    const middleware = ensureTenant();

    // First request — creates tenant
    const req1 = mockReq({
      tenant: { tenantId: 'org_existing', userId: 'user_1' },
    });
    await callMiddleware(middleware, req1);
    expect(req1.tenant!.slug).toBe('existing-org');
    expect(mockGetOrganization).toHaveBeenCalledTimes(1);

    // Second request — reuses tenant, no Clerk API call
    mockGetOrganization.mockClear();
    const req2 = mockReq({
      tenant: { tenantId: 'org_existing', userId: 'user_2' },
    });
    await callMiddleware(middleware, req2);
    expect(req2.tenant!.slug).toBe('existing-org');
    expect(mockGetOrganization).not.toHaveBeenCalled();
  });

  it('triggers fire-and-forget default database initialization for new tenants', async () => {
    mockGetOrganization.mockResolvedValue({
      id: 'org_newdb',
      slug: 'new-org',
      name: 'New Org',
    });

    const middleware = ensureTenant();
    const req = mockReq({
      tenant: { tenantId: 'org_newdb', userId: 'user_1' },
    });

    await callMiddleware(middleware, req);

    // Give fire-and-forget a tick to execute
    await new Promise((r) => setTimeout(r, 50));

    expect(mockInitializeDefaultDatabase).toHaveBeenCalledWith('org_newdb');
  });

  it('does not trigger DB init for existing tenants', async () => {
    mockGetOrganization.mockResolvedValue({
      id: 'org_noinit',
      slug: 'no-init',
      name: 'No Init',
    });

    const middleware = ensureTenant();

    // First request — creates tenant + triggers init
    const req1 = mockReq({
      tenant: { tenantId: 'org_noinit', userId: 'user_1' },
    });
    await callMiddleware(middleware, req1);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockInitializeDefaultDatabase).toHaveBeenCalledTimes(1);

    // Second request — existing tenant, no init
    mockInitializeDefaultDatabase.mockClear();
    const req2 = mockReq({
      tenant: { tenantId: 'org_noinit', userId: 'user_2' },
    });
    await callMiddleware(middleware, req2);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockInitializeDefaultDatabase).not.toHaveBeenCalled();
  });

  it('handles slug collision by appending suffix', async () => {
    // Pre-create a tenant with slug 'acme-corp'
    const store = getTenantStore();
    await store.create('org_first', 'acme-corp', 'First Acme');

    mockGetOrganization.mockResolvedValue({
      id: 'org_second',
      slug: 'acme-corp', // same slug!
      name: 'Second Acme',
    });

    const middleware = ensureTenant();
    const req = mockReq({
      tenant: { tenantId: 'org_second', userId: 'user_1' },
    });

    const result = await callMiddleware(middleware, req);

    expect(result.next).toBe(true);
    // Should get collision suffix
    expect(req.tenant!.slug).toBe('acme-corp-2');
  });

  it('handles race condition on concurrent tenant creation', async () => {
    mockGetOrganization.mockResolvedValue({
      id: 'org_race',
      slug: 'race-org',
      name: 'Race Org',
    });

    const middleware = ensureTenant();

    // Fire two concurrent requests for the same new tenant
    const req1 = mockReq({
      tenant: { tenantId: 'org_race', userId: 'user_1' },
    });
    const req2 = mockReq({
      tenant: { tenantId: 'org_race', userId: 'user_2' },
    });

    const [result1, result2] = await Promise.all([
      callMiddleware(middleware, req1),
      callMiddleware(middleware, req2),
    ]);

    // Both should succeed
    expect(result1.next).toBe(true);
    expect(result2.next).toBe(true);

    // Both should get the same slug
    expect(req1.tenant!.slug).toBe('race-org');
    expect(req2.tenant!.slug).toBe('race-org');

    // Only one tenant record should exist
    const store = getTenantStore();
    const tenant = await store.getById('org_race');
    expect(tenant).not.toBeNull();
    expect(tenant!.slug).toBe('race-org');
  });
});
