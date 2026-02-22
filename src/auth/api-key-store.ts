import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { getConfig } from '../config.js';
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
 * SQLite-based API key store for MCP endpoint authentication.
 * Uses the same config.db as DatabaseStore.
 */
export class ApiKeyStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const config = getConfig();
    const dataDir = config.DATA_DIR;
    const actualPath = dbPath ?? join(dataDir, 'config.db');

    // Ensure directory exists
    const dir = dirname(actualPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(actualPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
    logger.info({ path: actualPath }, 'API key store initialized');
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        expires_at TEXT,
        revoked_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    `);
  }

  /**
   * Create a new API key. Returns the raw key (only shown once).
   */
  create(tenantId: string, name: string, createdBy: string): { apiKey: ApiKey; rawKey: string } {
    const id = crypto.randomUUID();
    const rawKey = `dbmcp_${crypto.randomBytes(32).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO api_keys (id, tenant_id, name, key_hash, key_prefix, created_by, created_at)
      VALUES (@id, @tenant_id, @name, @key_hash, @key_prefix, @created_by, @created_at)
    `).run({
      id,
      tenant_id: tenantId,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      created_by: createdBy,
      created_at: now,
    });

    logger.info({ id, tenantId, name }, 'API key created');

    const apiKey: ApiKey = {
      id,
      tenantId,
      name,
      keyPrefix,
      createdBy,
      createdAt: now,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
    };

    return { apiKey, rawKey };
  }

  /**
   * Look up an API key by its hash.
   */
  getByHash(keyHash: string): ApiKeyWithHash | null {
    const row = this.db.prepare(
      'SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL'
    ).get(keyHash) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      ...this.rowToApiKey(row),
      keyHash: row.key_hash as string,
    };
  }

  /**
   * List all API keys for a tenant (never returns hash).
   */
  listByTenant(tenantId: string): ApiKey[] {
    const rows = this.db.prepare(
      'SELECT id, tenant_id, name, key_prefix, created_by, created_at, last_used_at, expires_at, revoked_at FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC'
    ).all(tenantId) as Record<string, unknown>[];

    return rows.map(row => this.rowToApiKey(row));
  }

  /**
   * Revoke an API key.
   */
  revoke(id: string, tenantId: string): boolean {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      'UPDATE api_keys SET revoked_at = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL'
    ).run(now, id, tenantId);

    if (result.changes > 0) {
      logger.info({ id, tenantId }, 'API key revoked');
      return true;
    }
    return false;
  }

  /**
   * Touch last_used_at timestamp.
   */
  touchLastUsed(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now, id);
  }

  private rowToApiKey(row: Record<string, unknown>): ApiKey {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      keyPrefix: row.key_prefix as string,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
      lastUsedAt: (row.last_used_at as string) || null,
      expiresAt: (row.expires_at as string) || null,
      revokedAt: (row.revoked_at as string) || null,
    };
  }

  close(): void {
    this.db.close();
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
