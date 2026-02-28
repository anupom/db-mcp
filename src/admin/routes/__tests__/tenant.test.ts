import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import pg from 'pg';

// Mock config
vi.mock('../../../config.js', () => ({
  getConfig: () => ({
    DATA_DIR: '/tmp',
    CUBE_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    LOG_LEVEL: 'silent',
  }),
}));

// Mock logger
vi.mock('../../../utils/logger.js', () => {
  const noopLogger = {
    info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(),
    child: () => noopLogger,
  };
  return { getLogger: () => noopLogger };
});

// Mock auth — we control tenant context and admin check via req.tenant
let authEnabled = true;
vi.mock('../../../auth/config.js', () => ({
  isAuthEnabled: () => authEnabled,
}));

// Mock requireOrgAdmin to check req.tenant.orgRole directly
vi.mock('../../../auth/middleware.js', () => ({
  requireOrgAdmin: () => (req: Request, res: Response, next: NextFunction) => {
    if (!authEnabled) return next();
    if (!req.tenant?.orgRole || req.tenant.orgRole !== 'org:admin') {
      res.status(403).json({ error: 'Organization admin role required' });
      return;
    }
    next();
  },
}));

import { DatabaseStore, initializeDatabaseStore, resetDatabaseStore } from '../../../registry/pg-store.js';
import tenantRouter from '../tenant.js';
import { TenantStore, resetTenantStore } from '../../../auth/tenant-store.js';

const TEST_SCHEMA = 'dbmcp';

// Helper to make HTTP-like calls via Express
function createApp(tenantContext: { tenantId?: string; orgRole?: string }) {
  const app = express();
  app.use(express.json());
  // Inject tenant context before routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.tenant = {
      tenantId: tenantContext.tenantId,
      userId: 'user_test',
      orgRole: tenantContext.orgRole,
    };
    next();
  });
  app.use('/tenant', tenantRouter);
  return app;
}

async function request(app: express.Express, method: 'get' | 'put', path: string, body?: unknown) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve) => {
    const req = {
      method: method.toUpperCase(),
      url: path,
      headers: { 'content-type': 'application/json' } as Record<string, string>,
      body: body ?? {},
    };

    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      _headers: {} as Record<string, string>,
      setHeader(k: string, v: string) { this._headers[k] = v; },
      getHeader(k: string) { return this._headers[k]; },
      write(chunk: Buffer | string) { chunks.push(Buffer.from(chunk)); },
      end(chunk?: Buffer | string) {
        if (chunk) chunks.push(Buffer.from(chunk));
        const text = Buffer.concat(chunks).toString();
        let parsed = {};
        try { parsed = JSON.parse(text); } catch { /* empty */ }
        resolve({ status: this.statusCode, body: parsed as Record<string, unknown> });
      },
    };

    app(req as unknown as express.Request, res as unknown as express.Response);
  });
}

describe('tenant routes', () => {
  let pool: pg.Pool;
  let store: TenantStore;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_URL
      || `postgresql://${process.env.POSTGRES_USER ?? 'cube'}:${process.env.POSTGRES_PASSWORD ?? 'cube'}@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}/${process.env.POSTGRES_DB ?? 'ecom'}`;
    pool = new pg.Pool({ connectionString });
    const pgStore = new DatabaseStore(pool);
    await pgStore.initialize();
    resetDatabaseStore();
    await initializeDatabaseStore();
    resetTenantStore();
    store = new TenantStore();
    authEnabled = true;

    // Clean up test data
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.tenants`);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM ${TEST_SCHEMA}.tenants`);
    await pool.end();
    resetTenantStore();
    resetDatabaseStore();
  });

  describe('GET /tenant', () => {
    it('returns tenant info', async () => {
      await store.create('org_get', 'my-org', 'My Organization');
      const app = createApp({ tenantId: 'org_get', orgRole: 'org:member' });

      const res = await request(app, 'get', '/tenant');

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('org_get');
      expect(res.body.slug).toBe('my-org');
      expect(res.body.name).toBe('My Organization');
    });

    it('returns 400 when no tenantId', async () => {
      const app = createApp({ tenantId: undefined });
      const res = await request(app, 'get', '/tenant');
      expect(res.status).toBe(400);
    });

    it('returns 404 when tenant not found', async () => {
      const app = createApp({ tenantId: 'org_missing' });
      const res = await request(app, 'get', '/tenant');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /tenant/slug', () => {
    it('updates slug for org admin', async () => {
      await store.create('org_update', 'old-slug', 'My Org');
      const app = createApp({ tenantId: 'org_update', orgRole: 'org:admin' });

      const res = await request(app, 'put', '/tenant/slug', { slug: 'new-slug' });

      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('new-slug');

      // Verify persisted
      const tenant = await store.getById('org_update');
      expect(tenant!.slug).toBe('new-slug');
    });

    it('returns 403 for non-admin', async () => {
      await store.create('org_nonadmin', 'some-slug');
      const app = createApp({ tenantId: 'org_nonadmin', orgRole: 'org:member' });

      const res = await request(app, 'put', '/tenant/slug', { slug: 'new-slug' });

      expect(res.status).toBe(403);

      // Slug unchanged
      const tenant = await store.getById('org_nonadmin');
      expect(tenant!.slug).toBe('some-slug');
    });

    it('returns 400 for invalid slug format', async () => {
      await store.create('org_invalid', 'valid-slug');
      const app = createApp({ tenantId: 'org_invalid', orgRole: 'org:admin' });

      // Too short
      const res1 = await request(app, 'put', '/tenant/slug', { slug: 'ab' });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('Invalid slug');

      // Starts with number
      const res2 = await request(app, 'put', '/tenant/slug', { slug: '1abc' });
      expect(res2.status).toBe(400);

      // Has uppercase
      const res3 = await request(app, 'put', '/tenant/slug', { slug: 'Abc' });
      expect(res3.status).toBe(400);
    });

    it('returns 400 when slug is missing', async () => {
      await store.create('org_missing_slug', 'existing');
      const app = createApp({ tenantId: 'org_missing_slug', orgRole: 'org:admin' });

      const res = await request(app, 'put', '/tenant/slug', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('slug is required');
    });

    it('returns 409 when slug is taken by another tenant', async () => {
      await store.create('org_a', 'taken-slug');
      await store.create('org_b', 'other-slug');
      const app = createApp({ tenantId: 'org_b', orgRole: 'org:admin' });

      const res = await request(app, 'put', '/tenant/slug', { slug: 'taken-slug' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already taken');

      // Original slug unchanged
      const tenant = await store.getById('org_b');
      expect(tenant!.slug).toBe('other-slug');
    });

    it('allows setting same slug (no-op)', async () => {
      await store.create('org_noop', 'same-slug');
      const app = createApp({ tenantId: 'org_noop', orgRole: 'org:admin' });

      const res = await request(app, 'put', '/tenant/slug', { slug: 'same-slug' });
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('same-slug');
    });
  });
});
