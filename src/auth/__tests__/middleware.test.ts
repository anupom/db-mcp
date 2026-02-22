import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock isAuthEnabled
vi.mock('../config.js', () => ({
  isAuthEnabled: vi.fn(() => false),
}));

// Mock tenant-store to avoid loading config.js (main config with CUBE_JWT_SECRET)
vi.mock('../tenant-store.js', () => ({
  getTenantStore: vi.fn(),
}));

// Mock tenant-slug to avoid transitive imports
vi.mock('../tenant-slug.js', () => ({
  generateUniqueSlug: vi.fn(),
}));

import { isAuthEnabled } from '../config.js';
import { requireTenant, requireOrgAdmin } from '../middleware.js';

function mockReq(overrides?: Partial<Request>): Request {
  return { tenant: undefined, ...overrides } as unknown as Request;
}

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('requireTenant', () => {
  beforeEach(() => {
    vi.mocked(isAuthEnabled).mockReturnValue(false);
  });

  it('sets req.tenant with undefined tenantId when auth disabled', () => {
    const middleware = requireTenant();
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenant).toEqual({ tenantId: undefined });
  });

  it('calls next without error when auth disabled', () => {
    const middleware = requireTenant();
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error arg
  });
});

describe('requireOrgAdmin', () => {
  beforeEach(() => {
    vi.mocked(isAuthEnabled).mockReturnValue(false);
  });

  it('passes through when auth disabled', () => {
    const middleware = requireOrgAdmin();
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when auth enabled and no tenant', () => {
    vi.mocked(isAuthEnabled).mockReturnValue(true);

    const middleware = requireOrgAdmin();
    const req = mockReq({ tenant: undefined });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when auth enabled and not admin', () => {
    vi.mocked(isAuthEnabled).mockReturnValue(true);

    const middleware = requireOrgAdmin();
    const req = mockReq({
      tenant: { tenantId: 'org_123', userId: 'user_123', orgRole: 'org:member' },
    });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toContain('admin');
  });

  it('passes through when auth enabled and is admin', () => {
    vi.mocked(isAuthEnabled).mockReturnValue(true);

    const middleware = requireOrgAdmin();
    const req = mockReq({
      tenant: { tenantId: 'org_123', userId: 'user_123', orgRole: 'org:admin' },
    });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next as NextFunction);

    expect(next).toHaveBeenCalled();
  });
});
