import { createHash } from 'crypto';
import { getDatabaseStore, type DatabaseStore } from './pg-store.js';
import { syncConnectionsToDisk, ensureDatabaseDirs, syncCubeFilesToDisk } from './fs-sync.js';
import { getConfig } from '../config.js';
import { getLogger } from '../utils/logger.js';
import type {
  DatabaseConfig,
  CreateDatabaseConfig,
  UpdateDatabaseConfig,
  DatabaseSummary,
  DatabaseTestResult,
  DatabaseRegistryEvent,
} from './types.js';

const logger = getLogger().child({ component: 'DatabaseManager' });

/**
 * Event listener type
 */
type EventListener = (event: DatabaseRegistryEvent) => void;

/**
 * Scope a database ID to a tenant by appending a 12-char hash of the tenantId.
 * Self-hosted (no tenant) returns the slug unchanged.
 * SaaS tenants get '{slug}-{12-char sha256}' to avoid PK collisions in the
 * global ID namespace (Cube.js routes entirely on databaseId).
 */
export function scopeDatabaseId(slug: string, tenantId?: string): string {
  if (!tenantId) return slug;
  const hash = createHash('sha256').update(tenantId).digest('hex').slice(0, 12);
  return `${slug}-${hash}`;
}

/**
 * Generate a globally unique default database ID for a tenant.
 * Self-hosted (no tenant) gets 'default'.
 * SaaS tenants get 'default-{8-char hash}' to avoid PK collisions.
 */
export function defaultDatabaseId(tenantId?: string): string {
  return scopeDatabaseId('default', tenantId);
}

/**
 * Database registry manager handles CRUD operations and lifecycle management
 */
export class DatabaseManager {
  private store: DatabaseStore;
  private listeners: Set<EventListener> = new Set();
  private dataDir: string;

  constructor(store?: DatabaseStore) {
    this.store = store ?? getDatabaseStore();
    this.dataDir = getConfig().DATA_DIR;
  }

  /**
   * Subscribe to registry events
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: DatabaseRegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.error({ error: err }, 'Event listener error');
      }
    }
  }

  /**
   * Get the data directory for a database
   */
  getDatabaseDataDir(databaseId: string): string {
    return `${this.dataDir}/databases/${databaseId}`;
  }

  /**
   * Create a new database
   */
  async createDatabase(config: CreateDatabaseConfig, tenantId?: string): Promise<DatabaseConfig> {
    // Scope the user-provided ID to the tenant so it's globally unique
    const userSlug = config.id;
    const scopedId = scopeDatabaseId(userSlug, tenantId);

    logger.info({ slug: userSlug, scopedId, name: config.name, tenantId }, 'Creating database');

    // Check global uniqueness of the scoped ID (no tenant filter — it's the PK)
    if (await this.store.exists(scopedId)) {
      throw new Error(`Database with ID '${userSlug}' already exists`);
    }

    // Validate JWT secret compatibility with Cube.js
    const globalConfig = getConfig();
    if (config.jwtSecret && config.jwtSecret !== globalConfig.CUBE_JWT_SECRET) {
      logger.warn(
        { id: scopedId },
        'Custom jwtSecret differs from global CUBE_JWT_SECRET. ' +
        'Cube.js verifies all JWTs with the global secret. ' +
        'Queries may fail with 401 if secrets do not match.'
      );
    }

    // Ensure disk directories for Cube.js
    await ensureDatabaseDirs(scopedId);

    // Create database record - use global JWT secret if not provided
    const cubeApiUrl = config.cubeApiUrl === globalConfig.CUBE_API_URL
      ? undefined
      : config.cubeApiUrl;
    const databaseWithDefaults = {
      ...config,
      id: scopedId,
      slug: userSlug,
      cubeApiUrl,
      jwtSecret: config.jwtSecret || globalConfig.CUBE_JWT_SECRET,
    };
    const database = await this.store.create(databaseWithDefaults, tenantId);

    // Create default catalog config in PG
    await this.store.upsertCatalogConfig(scopedId, {
      version: '1.0',
      defaults: { exposed: true, pii: false },
      members: {},
      defaultSegments: [],
      defaultFilters: [],
    });

    this.emit({ type: 'created', database });
    return database;
  }

  /**
   * Get a database by ID
   */
  async getDatabase(id: string, tenantId?: string): Promise<DatabaseConfig | null> {
    return this.store.get(id, tenantId);
  }

  /**
   * List all databases
   */
  async listDatabases(tenantId?: string): Promise<DatabaseSummary[]> {
    return this.store.list(tenantId);
  }

  /**
   * List active databases with full config
   */
  async listActiveDatabases(tenantId?: string): Promise<DatabaseConfig[]> {
    return this.store.listActive(tenantId);
  }

  /**
   * Update a database
   */
  async updateDatabase(config: UpdateDatabaseConfig, tenantId?: string): Promise<DatabaseConfig | null> {
    logger.info({ id: config.id, tenantId }, 'Updating database');

    const existing = await this.store.get(config.id, tenantId);
    if (!existing) {
      throw new Error(`Database '${config.id}' not found`);
    }

    // Don't allow updating connection while active
    if (existing.status === 'active' && config.connection) {
      throw new Error('Cannot update connection while database is active. Deactivate first.');
    }

    const globalConfig = getConfig();
    const updateConfig = config.cubeApiUrl === globalConfig.CUBE_API_URL
      ? { ...config, cubeApiUrl: null }
      : config;
    const updated = await this.store.update(updateConfig, tenantId);
    if (updated) {
      this.emit({ type: 'updated', database: updated });
    }
    return updated;
  }

  /**
   * Delete a database
   */
  async deleteDatabase(id: string, tenantId?: string): Promise<boolean> {
    logger.info({ id, tenantId }, 'Deleting database');

    const existing = await this.store.get(id, tenantId);
    if (!existing) {
      return false;
    }

    // Don't allow deleting while active
    if (existing.status === 'active') {
      throw new Error('Cannot delete an active database. Deactivate first.');
    }

    // Don't allow deleting the default database
    if (existing.slug === 'default') {
      throw new Error('Cannot delete the default database');
    }

    const deleted = await this.store.delete(id, tenantId);
    if (deleted) {
      this.emit({ type: 'deleted', databaseId: id });
      await syncConnectionsToDisk();
    }
    return deleted;
  }

  /**
   * Test database connection
   */
  async testConnection(id: string, tenantId?: string): Promise<DatabaseTestResult> {
    const config = await this.store.get(id, tenantId);
    if (!config) {
      return { success: false, message: `Database '${id}' not found` };
    }

    const startTime = Date.now();

    try {
      const { connection } = config;

      switch (connection.type) {
        case 'postgres':
        case 'mysql':
        case 'redshift':
          if (!connection.host || !connection.database) {
            return { success: false, message: 'Missing host or database in connection config' };
          }
          break;
        case 'bigquery':
          if (!connection.projectId) {
            return { success: false, message: 'Missing projectId for BigQuery' };
          }
          break;
        case 'snowflake':
          if (!connection.account || !connection.warehouse) {
            return { success: false, message: 'Missing account or warehouse for Snowflake' };
          }
          break;
      }

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        message: 'Connection configuration is valid',
        latencyMs,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Activate a database (make it available for MCP endpoints)
   */
  async activateDatabase(id: string, tenantId?: string): Promise<void> {
    logger.info({ id, tenantId }, 'Activating database');

    const config = await this.store.get(id, tenantId);
    if (!config) {
      throw new Error(`Database '${id}' not found`);
    }

    if (config.status === 'active') {
      return; // Already active
    }

    // Test connection first
    const testResult = await this.testConnection(id, tenantId);
    if (!testResult.success) {
      await this.store.updateStatus(id, 'error', testResult.message, tenantId);
      throw new Error(`Connection test failed: ${testResult.message}`);
    }

    // Update status to active
    await this.store.updateStatus(id, 'active', undefined, tenantId);
    this.emit({ type: 'activated', databaseId: id });

    // Sync cube files and connections to disk for Cube.js
    await syncCubeFilesToDisk(id);
    await syncConnectionsToDisk();
  }

  /**
   * Deactivate a database (stop serving MCP endpoints)
   */
  async deactivateDatabase(id: string, tenantId?: string): Promise<void> {
    logger.info({ id, tenantId }, 'Deactivating database');

    const config = await this.store.get(id, tenantId);
    if (!config) {
      throw new Error(`Database '${id}' not found`);
    }

    if (config.status === 'inactive') {
      return; // Already inactive
    }

    // Update status to inactive
    await this.store.updateStatus(id, 'inactive', undefined, tenantId);
    this.emit({ type: 'deactivated', databaseId: id });

    // Export updated connections for Cube.js
    await syncConnectionsToDisk();
  }

  /**
   * Export active database connections to JSON for Cube.js driverFactory.
   * Delegates to fs-sync.
   */
  async exportConnectionsForCube(): Promise<void> {
    await syncConnectionsToDisk();
  }

  /**
   * Initialize the default database if it doesn't exist.
   * Uses a tenant-scoped ID so each tenant gets its own globally unique database.
   * Returns the database ID that was created (or already existed).
   */
  async initializeDefaultDatabase(tenantId?: string): Promise<string> {
    const dbId = defaultDatabaseId(tenantId);

    if (await this.store.exists(dbId)) {
      logger.debug({ dbId }, 'Default database already exists');
      return dbId;
    }

    logger.info({ dbId, tenantId }, 'Creating default database');

    const globalConfig = getConfig();

    // Pass 'default' as the slug — createDatabase will scope it to dbId
    await this.createDatabase({
      id: 'default',
      name: 'Sample Database',
      description: 'Auto-created sample database to get you started',
      connection: {
        type: 'postgres',
        host: process.env.POSTGRES_HOST ?? 'localhost',
        port: parseInt(process.env.POSTGRES_PORT ?? '5432'),
        database: process.env.POSTGRES_DB ?? 'ecom',
        user: process.env.POSTGRES_USER ?? 'cube',
        password: process.env.POSTGRES_PASSWORD ?? 'cube',
      },
      jwtSecret: globalConfig.CUBE_JWT_SECRET,
      maxLimit: globalConfig.MAX_LIMIT,
      denyMembers: globalConfig.DENY_MEMBERS,
      defaultSegments: globalConfig.DEFAULT_SEGMENTS,
      returnSql: globalConfig.RETURN_SQL,
    }, tenantId);

    // Activate by default (also exports connections for Cube.js)
    await this.activateDatabase(dbId, tenantId);

    // Auto-introspect tables and generate cube YAMLs
    try {
      const { introspectAndGenerateCubes } = await import('../admin/services/auto-introspect.js');
      const result = await introspectAndGenerateCubes(dbId);
      logger.info(
        { dbId, generated: result.generated.length, failed: result.failed.length },
        'Auto-generated cubes for default database'
      );
    } catch (err) {
      // Non-fatal — database is still created and active, users can generate cubes manually
      logger.warn({ error: err, dbId }, 'Auto-introspection failed; cubes can be generated manually from Tables page');
    }

    return dbId;
  }
}

// Singleton instance
let defaultManager: DatabaseManager | null = null;

export function getDatabaseManager(): DatabaseManager {
  if (!defaultManager) {
    defaultManager = new DatabaseManager();
  }
  return defaultManager;
}

/**
 * Reset the singleton (for testing)
 */
export function resetDatabaseManager(): void {
  defaultManager = null;
}
