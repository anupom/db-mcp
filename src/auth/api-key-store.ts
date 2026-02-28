import * as crypto from 'crypto';
import { getDatabaseStore } from '../registry/pg-store.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ component: 'ApiKeyStore' });

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyWithHash extends ApiKey {
  keyHash: string;
}

/**
 * PostgreSQL-backed API key store (delegates to pg-store).
 */
export class ApiKeyStore {
  async create(tenantId: string, name: string, createdBy: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const store = getDatabaseStore();
    const result = await store.createApiKey(tenantId, name, createdBy);

    logger.info({ id: result.id, tenantId, name }, 'API key created');

    const apiKey: ApiKey = {
      id: result.id,
      tenantId,
      name,
      keyPrefix: result.keyPrefix,
      createdBy,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
    };

    return { apiKey, rawKey: result.rawKey };
  }

  async getByHash(keyHash: string): Promise<ApiKeyWithHash | null> {
    const store = getDatabaseStore();
    const row = await store.getApiKeyByHash(keyHash);
    if (!row) return null;
    return {
      ...this.rowToApiKey(row),
      keyHash: row.key_hash as string,
    };
  }

  /**
   * Validate a raw API key and return the associated key record.
   */
  async validate(rawKey: string): Promise<ApiKeyWithHash | null> {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    return this.getByHash(keyHash);
  }

  async listByTenant(tenantId: string): Promise<ApiKey[]> {
    const store = getDatabaseStore();
    const rows = await store.listApiKeysByTenant(tenantId);
    return rows.map(row => this.rowToApiKey(row));
  }

  async revoke(id: string, tenantId: string): Promise<boolean> {
    const store = getDatabaseStore();
    const result = await store.revokeApiKey(id, tenantId);
    if (result) {
      logger.info({ id, tenantId }, 'API key revoked');
    }
    return result;
  }

  async touchLastUsed(id: string): Promise<void> {
    const store = getDatabaseStore();
    await store.touchApiKeyLastUsed(id);
  }

  private rowToApiKey(row: Record<string, unknown>): ApiKey {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      keyPrefix: row.key_prefix as string,
      createdBy: row.created_by as string,
      createdAt: (row.created_at instanceof Date) ? row.created_at.toISOString() : row.created_at as string,
      lastUsedAt: row.last_used_at ? ((row.last_used_at instanceof Date) ? row.last_used_at.toISOString() : row.last_used_at as string) : null,
      expiresAt: row.expires_at ? ((row.expires_at instanceof Date) ? row.expires_at.toISOString() : row.expires_at as string) : null,
      revokedAt: row.revoked_at ? ((row.revoked_at instanceof Date) ? row.revoked_at.toISOString() : row.revoked_at as string) : null,
    };
  }

  close(): void {
    // No-op: pool lifecycle managed by pg-store
  }
}

// Singleton instance
let defaultStore: ApiKeyStore | null = null;

export function getApiKeyStore(): ApiKeyStore {
  if (!defaultStore) {
    defaultStore = new ApiKeyStore();
  }
  return defaultStore;
}
