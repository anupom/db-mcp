/**
 * Tenant context attached to requests when auth is enabled.
 * When auth is disabled (self-hosted), tenantId is undefined.
 */
export interface TenantContext {
  tenantId?: string;
  userId?: string;
  orgRole?: string;
  slug?: string;
}

// Augment Express Request with tenant context
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}
