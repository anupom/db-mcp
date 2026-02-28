import pg from 'pg';
import * as crypto from 'crypto';
import { getLogger } from '../utils/logger.js';
import type { DatabaseConfig, DatabaseSummary, CreateDatabaseConfig, UpdateDatabaseConfig } from './types.js';
import { DatabaseConfigSchema } from './types.js';

const logger = getLogger().child({ component: 'PgDatabaseStore' });

/**
 * Encryption utilities for sensitive data (same AES-256-GCM format as before)
 */
class Encryptor {
  private algorithm = 'aes-256-gcm' as const;
  private key: Buffer;

  constructor(secret: string, salt: string) {
    this.key = crypto.scryptSync(secret, salt, 32);
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as crypto.CipherGCM;
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
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
 * Build a DATABASE_URL from POSTGRES_* env vars, or use the provided DATABASE_URL.
 */
export function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const db = process.env.POSTGRES_DB ?? 'ecom';
  const user = process.env.POSTGRES_USER ?? 'cube';
  const pass = process.env.POSTGRES_PASSWORD ?? 'cube';
  return `postgresql://${user}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

/**
 * PostgreSQL-backed database configuration store.
 * Replaces the SQLite DatabaseStore. All methods are async.
 */
export class DatabaseStore {
  private pool: pg.Pool;
  private encryptor: Encryptor | null = null;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  /**
   * Initialize schema, tables, and encryption.
   * Uses an advisory lock to prevent races when multiple processes/tests start concurrently.
   */
  async initialize(adminSecret?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Advisory lock prevents concurrent schema initialization
      await client.query('SELECT pg_advisory_lock(2147483647)');
      try {
        await client.query(`CREATE SCHEMA IF NOT EXISTS dbmcp`);

        await client.query(`
          CREATE TABLE IF NOT EXISTS dbmcp.settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS dbmcp.databases (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'inactive',
            connection_json TEXT NOT NULL,
            cube_api_url TEXT,
            jwt_secret TEXT,
            max_limit INTEGER DEFAULT 1000,
            deny_members JSONB DEFAULT '[]',
            default_segments JSONB DEFAULT '[]',
            return_sql BOOLEAN DEFAULT FALSE,
            last_error TEXT,
            tenant_id TEXT,
            slug TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS dbmcp.cube_files (
            database_id TEXT NOT NULL REFERENCES dbmcp.databases(id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (database_id, file_name)
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS dbmcp.catalog_configs (
            database_id TEXT PRIMARY KEY REFERENCES dbmcp.databases(id) ON DELETE CASCADE,
            config JSONB NOT NULL DEFAULT '${JSON.stringify({ version: '1.0', defaults: { exposed: true, pii: false }, members: {}, defaultSegments: [], defaultFilters: [] })}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS dbmcp.tenants (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS dbmcp.api_keys (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            key_prefix TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ
          )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_databases_status ON dbmcp.databases(status)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_databases_tenant ON dbmcp.databases(tenant_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON dbmcp.api_keys(tenant_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON dbmcp.api_keys(key_hash)`);
      } finally {
        await client.query('SELECT pg_advisory_unlock(2147483647)');
      }
    } finally {
      client.release();
    }

    // Initialize encryption if ADMIN_SECRET is set
    if (adminSecret) {
      const salt = await this.getOrCreateSalt();
      this.encryptor = new Encryptor(adminSecret, salt);
    }

    logger.info('PostgreSQL database store initialized');
  }

  private async getOrCreateSalt(): Promise<string> {
    const result = await this.pool.query(
      "SELECT value FROM dbmcp.settings WHERE key = 'encryption_salt'"
    );
    if (result.rows.length > 0) return result.rows[0].value;

    const salt = crypto.randomBytes(16).toString('hex');
    await this.pool.query(
      "INSERT INTO dbmcp.settings (key, value) VALUES ('encryption_salt', $1) ON CONFLICT (key) DO NOTHING",
      [salt]
    );
    logger.info('Generated per-installation encryption salt');
    return salt;
  }

  private encryptConnection(connection: DatabaseConfig['connection']): string {
    const json = JSON.stringify(connection);
    if (this.encryptor) {
      return this.encryptor.encrypt(json);
    }
    return json;
  }

  private decryptConnection(encrypted: string): DatabaseConfig['connection'] {
    let json = encrypted;
    if (this.encryptor && encrypted.includes(':')) {
      try {
        json = this.encryptor.decrypt(encrypted);
      } catch {
        logger.warn('Failed to decrypt connection data, using as plain text');
      }
    }
    return JSON.parse(json);
  }

  private encryptSecret(secret: string | undefined): string | null {
    if (!secret) return null;
    if (this.encryptor) {
      return this.encryptor.encrypt(secret);
    }
    return secret;
  }

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

  private rowToConfig(row: Record<string, unknown>): DatabaseConfig {
    return DatabaseConfigSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      status: row.status,
      connection: this.decryptConnection(row.connection_json as string),
      cubeApiUrl: row.cube_api_url || undefined,
      jwtSecret: this.decryptSecret(row.jwt_secret as string | null),
      maxLimit: row.max_limit as number,
      denyMembers: row.deny_members as string[],
      defaultSegments: row.default_segments as string[],
      returnSql: Boolean(row.return_sql),
      lastError: row.last_error || undefined,
      tenantId: (row.tenant_id as string) || undefined,
      slug: (row.slug as string) || undefined,
      createdAt: (row.created_at as Date)?.toISOString(),
      updatedAt: (row.updated_at as Date)?.toISOString(),
    });
  }

  private tenantClause(tenantId?: string, paramOffset = 1): { sql: string; params: unknown[] } {
    if (tenantId === undefined) {
      return { sql: '', params: [] };
    }
    return { sql: ` AND tenant_id = $${paramOffset}`, params: [tenantId] };
  }

  async create(config: CreateDatabaseConfig, tenantId?: string): Promise<DatabaseConfig> {
    const now = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO dbmcp.databases (
        id, name, description, status, connection_json,
        cube_api_url, jwt_secret,
        max_limit, deny_members, default_segments, return_sql,
        tenant_id, slug, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'inactive', $4,
        $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14
      )`,
      [
        config.id,
        config.name,
        config.description ?? null,
        this.encryptConnection(config.connection),
        config.cubeApiUrl ?? null,
        this.encryptSecret(config.jwtSecret),
        config.maxLimit ?? 1000,
        JSON.stringify(config.denyMembers ?? []),
        JSON.stringify(config.defaultSegments ?? []),
        config.returnSql ? true : false,
        tenantId ?? null,
        config.slug ?? config.id,
        now,
        now,
      ]
    );

    logger.info({ id: config.id, tenantId }, 'Database configuration created');
    const result = await this.get(config.id, tenantId);
    return result!;
  }

  async get(id: string, tenantId?: string): Promise<DatabaseConfig | null> {
    const tc = this.tenantClause(tenantId, 2);
    const result = await this.pool.query(
      `SELECT * FROM dbmcp.databases WHERE id = $1${tc.sql}`,
      [id, ...tc.params]
    );

    if (result.rows.length === 0) return null;
    return this.rowToConfig(result.rows[0]);
  }

  async list(tenantId?: string): Promise<DatabaseSummary[]> {
    const tc = this.tenantClause(tenantId, 1);
    const result = await this.pool.query(
      `SELECT id, name, description, status, connection_json, tenant_id, slug, created_at, updated_at
       FROM dbmcp.databases
       WHERE 1=1${tc.sql}
       ORDER BY name`,
      tc.params
    );

    return result.rows.map(row => {
      const connection = this.decryptConnection(row.connection_json as string);
      return {
        id: row.id as string,
        name: row.name as string,
        description: row.description as string | undefined,
        status: row.status as DatabaseConfig['status'],
        connectionType: connection.type,
        tenantId: (row.tenant_id as string) || undefined,
        slug: (row.slug as string) || undefined,
        createdAt: (row.created_at as Date)?.toISOString(),
        updatedAt: (row.updated_at as Date)?.toISOString(),
      };
    });
  }

  async listActive(tenantId?: string): Promise<DatabaseConfig[]> {
    const tc = this.tenantClause(tenantId, 1);
    const result = await this.pool.query(
      `SELECT * FROM dbmcp.databases WHERE status = 'active'${tc.sql}`,
      tc.params
    );
    return result.rows.map(row => this.rowToConfig(row));
  }

  async update(config: UpdateDatabaseConfig, tenantId?: string): Promise<DatabaseConfig | null> {
    const existing = await this.get(config.id, tenantId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = $1'];
    const params: unknown[] = [now];
    let paramIndex = 2;

    if (config.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(config.name);
    }
    if (config.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(config.description);
    }
    if (config.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(config.status);
    }
    if (config.connection !== undefined) {
      updates.push(`connection_json = $${paramIndex++}`);
      params.push(this.encryptConnection(config.connection));
    }
    if (config.cubeApiUrl !== undefined) {
      updates.push(`cube_api_url = $${paramIndex++}`);
      params.push(config.cubeApiUrl);
    }
    if (config.jwtSecret !== undefined) {
      updates.push(`jwt_secret = $${paramIndex++}`);
      params.push(this.encryptSecret(config.jwtSecret));
    }
    if (config.maxLimit !== undefined) {
      updates.push(`max_limit = $${paramIndex++}`);
      params.push(config.maxLimit);
    }
    if (config.denyMembers !== undefined) {
      updates.push(`deny_members = $${paramIndex++}`);
      params.push(JSON.stringify(config.denyMembers));
    }
    if (config.defaultSegments !== undefined) {
      updates.push(`default_segments = $${paramIndex++}`);
      params.push(JSON.stringify(config.defaultSegments));
    }
    if (config.returnSql !== undefined) {
      updates.push(`return_sql = $${paramIndex++}`);
      params.push(config.returnSql);
    }
    if (config.lastError !== undefined) {
      updates.push(`last_error = $${paramIndex++}`);
      params.push(config.lastError);
    }

    params.push(config.id);
    const idParam = `$${paramIndex}`;
    paramIndex++;
    const tc = this.tenantClause(tenantId, paramIndex);
    params.push(...tc.params);

    await this.pool.query(
      `UPDATE dbmcp.databases SET ${updates.join(', ')} WHERE id = ${idParam}${tc.sql}`,
      params
    );

    logger.info({ id: config.id, tenantId }, 'Database configuration updated');
    return this.get(config.id, tenantId);
  }

  async delete(id: string, tenantId?: string): Promise<boolean> {
    const tc = this.tenantClause(tenantId, 2);
    const result = await this.pool.query(
      `DELETE FROM dbmcp.databases WHERE id = $1${tc.sql}`,
      [id, ...tc.params]
    );

    if ((result.rowCount ?? 0) > 0) {
      logger.info({ id, tenantId }, 'Database configuration deleted');
      return true;
    }
    return false;
  }

  async updateStatus(id: string, status: DatabaseConfig['status'], error?: string, tenantId?: string): Promise<boolean> {
    const now = new Date().toISOString();
    const tc = this.tenantClause(tenantId, 5);
    const result = await this.pool.query(
      `UPDATE dbmcp.databases
       SET status = $1, last_error = $2, updated_at = $3
       WHERE id = $4${tc.sql}`,
      [status, error ?? null, now, id, ...tc.params]
    );

    if ((result.rowCount ?? 0) > 0) {
      logger.info({ id, status, tenantId }, 'Database status updated');
      return true;
    }
    return false;
  }

  async exists(id: string, tenantId?: string): Promise<boolean> {
    const tc = this.tenantClause(tenantId, 2);
    const result = await this.pool.query(
      `SELECT 1 FROM dbmcp.databases WHERE id = $1${tc.sql}`,
      [id, ...tc.params]
    );
    return result.rows.length > 0;
  }

  // ── Cube files ──

  async getCubeFile(databaseId: string, fileName: string): Promise<{ content: string } | null> {
    const result = await this.pool.query(
      `SELECT content FROM dbmcp.cube_files WHERE database_id = $1 AND file_name = $2`,
      [databaseId, fileName]
    );
    if (result.rows.length === 0) return null;
    return { content: result.rows[0].content };
  }

  async listCubeFiles(databaseId: string): Promise<Array<{ fileName: string; updatedAt: string }>> {
    const result = await this.pool.query(
      `SELECT file_name, updated_at FROM dbmcp.cube_files WHERE database_id = $1 ORDER BY file_name`,
      [databaseId]
    );
    return result.rows.map(row => ({
      fileName: row.file_name,
      updatedAt: (row.updated_at as Date)?.toISOString(),
    }));
  }

  async upsertCubeFile(databaseId: string, fileName: string, content: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO dbmcp.cube_files (database_id, file_name, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (database_id, file_name)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [databaseId, fileName, content]
    );
  }

  async deleteCubeFile(databaseId: string, fileName: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM dbmcp.cube_files WHERE database_id = $1 AND file_name = $2`,
      [databaseId, fileName]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getAllCubeFiles(databaseId: string): Promise<Array<{ fileName: string; content: string }>> {
    const result = await this.pool.query(
      `SELECT file_name, content FROM dbmcp.cube_files WHERE database_id = $1`,
      [databaseId]
    );
    return result.rows.map(row => ({
      fileName: row.file_name,
      content: row.content,
    }));
  }

  // ── Catalog configs ──

  async getCatalogConfig(databaseId: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(
      `SELECT config FROM dbmcp.catalog_configs WHERE database_id = $1`,
      [databaseId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].config;
  }

  async upsertCatalogConfig(databaseId: string, config: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `INSERT INTO dbmcp.catalog_configs (database_id, config, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (database_id)
       DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
      [databaseId, JSON.stringify(config)]
    );
  }

  // ── Tenants ──

  async getTenantById(id: string): Promise<{ id: string; slug: string; name: string | null; createdAt: string; updatedAt: string } | null> {
    const result = await this.pool.query(
      `SELECT * FROM dbmcp.tenants WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return this.rowToTenant(result.rows[0]);
  }

  async getTenantBySlug(slug: string): Promise<{ id: string; slug: string; name: string | null; createdAt: string; updatedAt: string } | null> {
    const result = await this.pool.query(
      `SELECT * FROM dbmcp.tenants WHERE slug = $1`,
      [slug]
    );
    if (result.rows.length === 0) return null;
    return this.rowToTenant(result.rows[0]);
  }

  async createTenant(id: string, slug: string, name?: string): Promise<{ id: string; slug: string; name: string | null; createdAt: string; updatedAt: string }> {
    await this.pool.query(
      `INSERT INTO dbmcp.tenants (id, slug, name) VALUES ($1, $2, $3)`,
      [id, slug, name ?? null]
    );
    return (await this.getTenantById(id))!;
  }

  async updateTenantSlug(id: string, newSlug: string): Promise<{ id: string; slug: string; name: string | null; createdAt: string; updatedAt: string } | null> {
    const result = await this.pool.query(
      `UPDATE dbmcp.tenants SET slug = $1, updated_at = NOW() WHERE id = $2`,
      [newSlug, id]
    );
    if ((result.rowCount ?? 0) === 0) return null;
    return this.getTenantById(id);
  }

  async tenantSlugExists(slug: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM dbmcp.tenants WHERE slug = $1`,
      [slug]
    );
    return result.rows.length > 0;
  }

  private rowToTenant(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: (row.name as string) || null,
      createdAt: (row.created_at as Date)?.toISOString(),
      updatedAt: (row.updated_at as Date)?.toISOString(),
    };
  }

  // ── API Keys ──

  async createApiKey(tenantId: string, name: string, createdBy: string): Promise<{ id: string; rawKey: string; keyPrefix: string }> {
    const id = crypto.randomUUID();
    const rawKey = `dbmcp_${crypto.randomBytes(32).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    await this.pool.query(
      `INSERT INTO dbmcp.api_keys (id, tenant_id, name, key_hash, key_prefix, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tenantId, name, keyHash, keyPrefix, createdBy]
    );

    return { id, rawKey, keyPrefix };
  }

  async getApiKeyByHash(keyHash: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(
      `SELECT * FROM dbmcp.api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
      [keyHash]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as Record<string, unknown>;
  }

  async listApiKeysByTenant(tenantId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, name, key_prefix, created_by, created_at, last_used_at, expires_at, revoked_at
       FROM dbmcp.api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async revokeApiKey(id: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE dbmcp.api_keys SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async touchApiKeyLastUsed(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE dbmcp.api_keys SET last_used_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  // ── Pool management ──

  getPool(): pg.Pool {
    return this.pool;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── Singleton ──

let defaultStore: DatabaseStore | null = null;

export async function initializeDatabaseStore(adminSecret?: string): Promise<DatabaseStore> {
  if (defaultStore) return defaultStore;

  const pool = new pg.Pool({ connectionString: buildDatabaseUrl() });
  const store = new DatabaseStore(pool);
  await store.initialize(adminSecret);
  defaultStore = store;
  return store;
}

export function getDatabaseStore(): DatabaseStore {
  if (!defaultStore) {
    throw new Error('DatabaseStore not initialized. Call initializeDatabaseStore() first.');
  }
  return defaultStore;
}

export function resetDatabaseStore(): void {
  defaultStore = null;
}
