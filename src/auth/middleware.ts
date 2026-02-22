import { Request, Response, NextFunction, RequestHandler } from 'express';
import { isAuthEnabled } from './config.js';
import type { TenantContext } from './types.js';
import { getTenantStore } from './tenant-store.js';
import { generateUniqueSlug } from './tenant-slug.js';

// Re-export to ensure type augmentation is loaded
export type { TenantContext } from './types.js';

// Cached Clerk module imports (loaded once when auth is enabled)
let clerkModule: {
  clerkMiddleware: () => RequestHandler;
  getAuth: (req: Request) => { userId?: string; orgId?: string; orgRole?: string } | null;
} | null = null;

async function loadClerk() {
  if (!clerkModule) {
    const mod = await import('@clerk/express');
    clerkModule = {
      clerkMiddleware: mod.clerkMiddleware as () => RequestHandler,
      getAuth: mod.getAuth as (req: Request) => { userId?: string; orgId?: string; orgRole?: string } | null,
    };
  }
  return clerkModule;
}

/**
 * Clerk session middleware.
 * When auth is disabled: passthrough.
 * When auth is enabled: runs Clerk's clerkMiddleware() to parse JWT from Authorization header.
 *
 * Must be awaited at startup (returns a ready-to-use middleware).
 */
export function clerkSessionMiddleware(): RequestHandler {
  if (!isAuthEnabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  // Eager load Clerk and cache the middleware instance
  let middleware: RequestHandler | null = null;
  let initPromise: Promise<void> | null = null;

  function ensureInit(): Promise<void> {
    if (!initPromise) {
      initPromise = loadClerk().then(clerk => {
        middleware = clerk.clerkMiddleware();
      }).catch(err => {
        initPromise = null; // Allow retry on next request
        throw err;
      });
    }
    return initPromise;
  }

  ensureInit(); // Start eagerly

  return (req: Request, res: Response, next: NextFunction) => {
    if (middleware) {
      return middleware(req, res, next);
    }
    // Wait for initialization if not ready yet
    ensureInit().then(() => {
      middleware!(req, res, next);
    }).catch(next);
  };
}

/**
 * Require a valid tenant context.
 * When auth is disabled: sets req.tenant with tenantId = undefined (self-hosted passthrough).
 * When auth is enabled: requires a valid Clerk session with an active org. Returns 401/403 on failure.
 */
export function requireTenant(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthEnabled()) {
      req.tenant = { tenantId: undefined };
      return next();
    }

    if (!clerkModule) {
      res.status(500).json({ error: 'Auth not initialized' });
      return;
    }

    const auth = clerkModule.getAuth(req);

    if (!auth?.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!auth.orgId) {
      res.status(403).json({ error: 'Organization membership required. Please select or create an organization.' });
      return;
    }

    const tenant: TenantContext = {
      tenantId: auth.orgId,
      userId: auth.userId,
      orgRole: auth.orgRole ?? undefined,
    };
    req.tenant = tenant;
    next();
  };
}

/**
 * Require org admin role.
 * When auth is disabled: passthrough.
 * When auth is enabled: checks orgRole === 'org:admin'. Returns 403 if not admin.
 * Must be used after requireTenant().
 */
export function requireOrgAdmin(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthEnabled()) {
      return next();
    }

    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.tenant.orgRole !== 'org:admin') {
      res.status(403).json({ error: 'Organization admin role required' });
      return;
    }

    next();
  };
}

/**
 * Ensure tenant record exists in the tenants table and attach slug.
 * When auth is disabled: passthrough.
 * When auth is enabled: looks up tenant by tenantId, auto-creates if not found.
 * Must be used after requireTenant().
 */
export function ensureTenant(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthEnabled() || !req.tenant?.tenantId) {
      return next();
    }

    try {
      const store = getTenantStore();
      let tenant = store.getById(req.tenant.tenantId);

      if (!tenant) {
        const slug = generateUniqueSlug(
          req.tenant.tenantId,
          (s) => store.slugExists(s)
        );
        tenant = store.create(req.tenant.tenantId, slug);
      }

      req.tenant.slug = tenant.slug;
      next();
    } catch (err) {
      next(err);
    }
  };
}
