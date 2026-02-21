import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { getConfig } from '../config.js';
import { getLogger } from '../utils/logger.js';
import type { DatabaseConfig, DatabaseSummary, CreateDatabaseConfig, UpdateDatabaseConfig } from './types.js';
import { DatabaseConfigSchema } from './types.js';

const logger = getLogger().child({ component: 'DatabaseStore' });

/**
 * Encryption utilities for sensitive data
 */
class Encryptor {
  private algorithm = 'aes-256-gcm' as const;
  private key: Buffer;

  constructor(secret: string) {
    // Derive a 32-byte key from the secret
    this.key = crypto.scryptSync(secret, 'db-mcp-salt', 32);
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as crypto.CipherGCM;
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

/**
 * SQLite-based database configuration store
 */
export class DatabaseStore {
  private db: Database.Database;
  private encryptor: Encryptor | null = null;

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

    // Initialize encryption if ADMIN_SECRET is set
    if (config.ADMIN_SECRET) {
      this.encryptor = new Encryptor(config.ADMIN_SECRET);
    }

    this.initialize();
    logger.info({ path: actualPath }, 'Database store initialized');
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS databases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'inactive',
        connection_json TEXT NOT NULL,
        cube_api_url TEXT,
        jwt_secret TEXT,
        catalog_path TEXT,
        cube_model_path TEXT,
        max_limit INTEGER DEFAULT 1000,
        deny_members TEXT DEFAULT '[]',
        default_segments TEXT DEFAULT '[]',
        return_sql INTEGER DEFAULT 0,
        last_error TEXT,
        tenant_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_databases_status ON databases(status);
      CREATE INDEX IF NOT EXISTS idx_databases_tenant ON databases(tenant_id);
    `);
  }

  /**
   * Encrypt sensitive connection data
   */
  private encryptConnection(connection: DatabaseConfig['connection']): string {
    const json = JSON.stringify(connection);
    if (this.encryptor) {
      return this.encryptor.encrypt(json);
    }
    return json;
  }

  /**
   * Decrypt sensitive connection data
   */
  private decryptConnection(encrypted: string): DatabaseConfig['connection'] {
    let json = encrypted;
    if (this.encryptor && encrypted.includes(':')) {
      try {
        json = this.encryptor.decrypt(encrypted);
      } catch {
        // Fall back to unencrypted if decryption fails
        logger.warn('Failed to decrypt connection data, using as plain text');
      }
    }
    return JSON.parse(json);
  }

  /**
   * Encrypt JWT secret
   */
  private encryptSecret(secret: string | undefined): string | null {
    if (!secret) return null;
    if (this.encryptor) {
      return this.encryptor.encrypt(secret);
    }
    return secret;
  }

  /**
   * Decrypt JWT secret
   */
  private decryptSecret(encrypted: string | null): string | undefined {
    if (!encrypted) return undefined;
    if (this.encryptor && encrypted.includes(':')) {
      try {
        return this.encryptor.decrypt(encrypted);
      } catch {
        logger.warn('Failed to decrypt secret, using as plain text');
      }
    }
    return encrypted;
  }

  /**
   * Convert database row to DatabaseConfig
   */
  private rowToConfig(row: Record<string, unknown>): DatabaseConfig {
    return DatabaseConfigSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      status: row.status,
      connection: this.decryptConnection(row.connection_json as string),
      cubeApiUrl: row.cube_api_url || undefined,
      jwtSecret: this.decryptSecret(row.jwt_secret as string | null),
      catalogPath: row.catalog_path || undefined,
      cubeModelPath: row.cube_model_path || undefined,
      maxLimit: row.max_limit as number,
      denyMembers: JSON.parse(row.deny_members as string || '[]'),
      defaultSegments: JSON.parse(row.default_segments as string || '[]'),
      returnSql: Boolean(row.return_sql),
      lastError: row.last_error || undefined,
      tenantId: (row.tenant_id as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    });
  }

  /**
   * Build a tenant WHERE clause fragment.
   * When tenantId is undefined (self-hosted), returns empty string — no filtering.
   */
  private tenantClause(tenantId?: string): { sql: string; params: unknown[] } {
    if (tenantId === undefined) {
      return { sql: '', params: [] };
    }
    return { sql: ' AND tenant_id = ?', params: [tenantId] };
  }

  /**
   * Create a new database configuration
   */
  create(config: CreateDatabaseConfig, tenantId?: string): DatabaseConfig {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO databases (
        id, name, description, status, connection_json,
        cube_api_url, jwt_secret, catalog_path, cube_model_path,
        max_limit, deny_members, default_segments, return_sql,
        tenant_id, created_at, updated_at
      ) VALUES (
        @id, @name, @description, 'inactive', @connection_json,
        @cube_api_url, @jwt_secret, @catalog_path, @cube_model_path,
        @max_limit, @deny_members, @default_segments, @return_sql,
        @tenant_id, @created_at, @updated_at
      )
    `);

    stmt.run({
      id: config.id,
      name: config.name,
      description: config.description ?? null,
      connection_json: this.encryptConnection(config.connection),
      cube_api_url: config.cubeApiUrl ?? null,
      jwt_secret: this.encryptSecret(config.jwtSecret),
      catalog_path: config.catalogPath ?? null,
      cube_model_path: config.cubeModelPath ?? null,
      max_limit: config.maxLimit ?? 1000,
      deny_members: JSON.stringify(config.denyMembers ?? []),
      default_segments: JSON.stringify(config.defaultSegments ?? []),
      return_sql: config.returnSql ? 1 : 0,
      tenant_id: tenantId ?? null,
      created_at: now,
      updated_at: now,
    });

    logger.info({ id: config.id, tenantId }, 'Database configuration created');
    return this.get(config.id, tenantId)!;
  }

  /**
   * Get a database configuration by ID
   */
  get(id: string, tenantId?: string): DatabaseConfig | null {
    const tc = this.tenantClause(tenantId);
    const stmt = this.db.prepare(`SELECT * FROM databases WHERE id = ?${tc.sql}`);
    const row = stmt.get(id, ...tc.params) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToConfig(row);
  }

  /**
   * List all database configurations
   */
  list(tenantId?: string): DatabaseSummary[] {
    const tc = this.tenantClause(tenantId);
    const whereClause = tenantId !== undefined ? `WHERE tenant_id = ?` : '';
    const stmt = this.db.prepare(`
      SELECT id, name, description, status, connection_json, tenant_id, created_at, updated_at
      FROM databases
      ${whereClause}
      ORDER BY name
    `);
    const rows = (tenantId !== undefined ? stmt.all(tenantId) : stmt.all()) as Record<string, unknown>[];

    return rows.map(row => {
      const connection = this.decryptConnection(row.connection_json as string);
      return {
        id: row.id as string,
        name: row.name as string,
        description: row.description as string | undefined,
        status: row.status as DatabaseConfig['status'],
        connectionType: connection.type,
        tenantId: (row.tenant_id as string) || undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      };
    });
  }

  /**
   * List active database configurations
   */
  listActive(tenantId?: string): DatabaseConfig[] {
    const tc = this.tenantClause(tenantId);
    const stmt = this.db.prepare(`SELECT * FROM databases WHERE status = 'active'${tc.sql}`);
    const rows = stmt.all(...tc.params) as Record<string, unknown>[];
    return rows.map(row => this.rowToConfig(row));
  }

  /**
   * Update a database configuration
   */
  update(config: UpdateDatabaseConfig, tenantId?: string): DatabaseConfig | null {
    const existing = this.get(config.id, tenantId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = @updated_at'];
    const params: Record<string, unknown> = { id: config.id, updated_at: now };

    if (config.name !== undefined) {
      updates.push('name = @name');
      params.name = config.name;
    }
    if (config.description !== undefined) {
      updates.push('description = @description');
      params.description = config.description;
    }
    if (config.status !== undefined) {
      updates.push('status = @status');
      params.status = config.status;
    }
    if (config.connection !== undefined) {
      updates.push('connection_json = @connection_json');
      params.connection_json = this.encryptConnection(config.connection);
    }
    if (config.cubeApiUrl !== undefined) {
      updates.push('cube_api_url = @cube_api_url');
      params.cube_api_url = config.cubeApiUrl;
    }
    if (config.jwtSecret !== undefined) {
      updates.push('jwt_secret = @jwt_secret');
      params.jwt_secret = this.encryptSecret(config.jwtSecret);
    }
    if (config.catalogPath !== undefined) {
      updates.push('catalog_path = @catalog_path');
      params.catalog_path = config.catalogPath;
    }
    if (config.cubeModelPath !== undefined) {
      updates.push('cube_model_path = @cube_model_path');
      params.cube_model_path = config.cubeModelPath;
    }
    if (config.maxLimit !== undefined) {
      updates.push('max_limit = @max_limit');
      params.max_limit = config.maxLimit;
    }
    if (config.denyMembers !== undefined) {
      updates.push('deny_members = @deny_members');
      params.deny_members = JSON.stringify(config.denyMembers);
    }
    if (config.defaultSegments !== undefined) {
      updates.push('default_segments = @default_segments');
      params.default_segments = JSON.stringify(config.defaultSegments);
    }
    if (config.returnSql !== undefined) {
      updates.push('return_sql = @return_sql');
      params.return_sql = config.returnSql ? 1 : 0;
    }
    if (config.lastError !== undefined) {
      updates.push('last_error = @last_error');
      params.last_error = config.lastError;
    }

    // Tenant-scoped update: only update if tenant matches
    const tc = this.tenantClause(tenantId);
    const sql = `UPDATE databases SET ${updates.join(', ')} WHERE id = @id${tc.sql}`;
    const stmt = this.db.prepare(sql);
    // For positional tenant params, we need to use named params approach differently
    if (tenantId !== undefined) {
      params.tenant_id_filter = tenantId;
      const sqlWithNamed = `UPDATE databases SET ${updates.join(', ')} WHERE id = @id AND tenant_id = @tenant_id_filter`;
      this.db.prepare(sqlWithNamed).run(params);
    } else {
      stmt.run(params);
    }

    logger.info({ id: config.id, tenantId }, 'Database configuration updated');
    return this.get(config.id, tenantId);
  }

  /**
   * Delete a database configuration
   */
  delete(id: string, tenantId?: string): boolean {
    const tc = this.tenantClause(tenantId);
    const stmt = this.db.prepare(`DELETE FROM databases WHERE id = ?${tc.sql}`);
    const result = stmt.run(id, ...tc.params);

    if (result.changes > 0) {
      logger.info({ id, tenantId }, 'Database configuration deleted');
      return true;
    }
    return false;
  }

  /**
   * Update status of a database
   */
  updateStatus(id: string, status: DatabaseConfig['status'], error?: string, tenantId?: string): boolean {
    const now = new Date().toISOString();
    const tc = this.tenantClause(tenantId);
    const stmt = this.db.prepare(`
      UPDATE databases
      SET status = @status, last_error = @last_error, updated_at = @updated_at
      WHERE id = @id${tc.sql}
    `);

    // Use named params + positional for tenant
    if (tenantId !== undefined) {
      const stmtWithTenant = this.db.prepare(`
        UPDATE databases
        SET status = @status, last_error = @last_error, updated_at = @updated_at
        WHERE id = @id AND tenant_id = @tenant_id
      `);
      const result = stmtWithTenant.run({
        id,
        status,
        last_error: error ?? null,
        updated_at: now,
        tenant_id: tenantId,
      });
      if (result.changes > 0) {
        logger.info({ id, status, tenantId }, 'Database status updated');
        return true;
      }
      return false;
    }

    const result = stmt.run({
      id,
      status,
      last_error: error ?? null,
      updated_at: now,
    });

    if (result.changes > 0) {
      logger.info({ id, status }, 'Database status updated');
      return true;
    }
    return false;
  }

  /**
   * Check if a database ID exists
   */
  exists(id: string, tenantId?: string): boolean {
    const tc = this.tenantClause(tenantId);
    const stmt = this.db.prepare(`SELECT 1 FROM databases WHERE id = ?${tc.sql}`);
    return stmt.get(id, ...tc.params) !== undefined;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let defaultStore: DatabaseStore | null = null;

export function getDatabaseStore(): DatabaseStore {
  if (!defaultStore) {
    defaultStore = new DatabaseStore();
  }
  return defaultStore;
}

/**
 * Reset the singleton (for testing)
 */
export function resetDatabaseStore(): void {
  if (defaultStore) {
    defaultStore.close();
    defaultStore = null;
  }
}
