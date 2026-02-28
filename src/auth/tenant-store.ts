import { getDatabaseStore } from '../registry/pg-store.js';
import { getLogger } from '../utils/logger.js';
import { isValidSlug } from './tenant-slug.js';

const logger = getLogger().child({ component: 'TenantStore' });

export interface Tenant {
  id: string;
  slug: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * PostgreSQL-backed tenant store (delegates to pg-store).
 */
export class TenantStore {
  getById(id: string): Promise<Tenant | null> {
    return getDatabaseStore().getTenantById(id);
  }

  getBySlug(slug: string): Promise<Tenant | null> {
    return getDatabaseStore().getTenantBySlug(slug);
  }

  async create(id: string, slug: string, name?: string): Promise<Tenant> {
    if (!isValidSlug(slug)) {
      throw new Error(`Invalid slug: "${slug}". Must match ^[a-z][a-z0-9-]{2,47}$`);
    }

    const tenant = await getDatabaseStore().createTenant(id, slug, name);
    logger.info({ id, slug }, 'Tenant created');
    return tenant;
  }

  async updateSlug(id: string, newSlug: string): Promise<Tenant | null> {
    if (!isValidSlug(newSlug)) {
      throw new Error(`Invalid slug: "${newSlug}". Must match ^[a-z][a-z0-9-]{2,47}$`);
    }

    return getDatabaseStore().updateTenantSlug(id, newSlug);
  }

  slugExists(slug: string): Promise<boolean> {
    return getDatabaseStore().tenantSlugExists(slug);
  }

  close(): void {
    // No-op: pool lifecycle managed by pg-store
  }
}

// Singleton instance
let defaultStore: TenantStore | null = null;

export function getTenantStore(): TenantStore {
  if (!defaultStore) {
    defaultStore = new TenantStore();
  }
  return defaultStore;
}

export function resetTenantStore(): void {
  defaultStore = null;
}
