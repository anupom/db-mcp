import { createHash } from 'crypto';
import { mkdirSync, existsSync, writeFileSync, copyFileSync, readdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { stringify as yamlStringify } from 'yaml';
import { getDatabaseStore, type DatabaseStore } from './store.js';
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
    return join(this.dataDir, 'databases', databaseId);
  }

  /**
   * Get the catalog path for a database
   */
  getCatalogPath(databaseId: string, config?: DatabaseConfig): string {
    if (config?.catalogPath) {
      return config.catalogPath;
    }
    return join(this.getDatabaseDataDir(databaseId), 'agent_catalog.yaml');
  }

  /**
   * Get the cube model path for a database
   */
  getCubeModelPath(databaseId: string, config?: DatabaseConfig): string {
    if (config?.cubeModelPath) {
      return config.cubeModelPath;
    }
    return join(this.getDatabaseDataDir(databaseId), 'cube', 'model');
  }

  /**
   * Initialize data directory structure for a database
   */
  private initializeDataDirectory(databaseId: string): void {
    const baseDir = this.getDatabaseDataDir(databaseId);
    const cubeModelDir = join(baseDir, 'cube', 'model', 'cubes');

    // Create directories
    if (!existsSync(cubeModelDir)) {
      mkdirSync(cubeModelDir, { recursive: true });
      logger.debug({ path: cubeModelDir }, 'Created cube model directory');
    }

    // Create default agent_catalog.yaml if it doesn't exist
    const catalogPath = join(baseDir, 'agent_catalog.yaml');
    if (!existsSync(catalogPath)) {
      const defaultCatalog = {
        version: '1.0',
        defaults: {
          exposed: true,
          pii: false,
        },
        members: {},
        defaultSegments: [],
        defaultFilters: [],
      };
      writeFileSync(catalogPath, yamlStringify(defaultCatalog), 'utf-8');
      logger.debug({ path: catalogPath }, 'Created default agent catalog');
    }
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
    if (this.store.exists(scopedId)) {
      throw new Error(`Database with ID '${userSlug}' already exists`);
    }

    // Validate JWT secret compatibility with Cube.js
    // Cube.js only supports a single JWT secret, so all databases must use the same secret
    const globalConfig = getConfig();
    if (config.jwtSecret && config.jwtSecret !== globalConfig.CUBE_JWT_SECRET) {
      logger.warn(
        { id: scopedId },
        'Custom jwtSecret differs from global CUBE_JWT_SECRET. ' +
        'Cube.js verifies all JWTs with the global secret. ' +
        'Queries may fail with 401 if secrets do not match.'
      );
    }

    // Initialize data directory structure using the scoped ID
    this.initializeDataDirectory(scopedId);

    // Create database record - use global JWT secret if not provided
    // Don't persist cubeApiUrl if it matches the env var default — the runtime
    // fallback handles it and avoids baking in environment-specific hostnames
    // (e.g. localhost:4000 in local dev vs cube:4000 in Docker)
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
    const database = this.store.create(databaseWithDefaults, tenantId);

    this.emit({ type: 'created', database });
    return database;
  }

  /**
   * Get a database by ID
   */
  getDatabase(id: string, tenantId?: string): DatabaseConfig | null {
    return this.store.get(id, tenantId);
  }

  /**
   * List all databases
   */
  listDatabases(tenantId?: string): DatabaseSummary[] {
    return this.store.list(tenantId);
  }

  /**
   * List active databases with full config
   */
  listActiveDatabases(tenantId?: string): DatabaseConfig[] {
    return this.store.listActive(tenantId);
  }

  /**
   * Update a database
   */
  async updateDatabase(config: UpdateDatabaseConfig, tenantId?: string): Promise<DatabaseConfig | null> {
    logger.info({ id: config.id, tenantId }, 'Updating database');

    const existing = this.store.get(config.id, tenantId);
    if (!existing) {
      throw new Error(`Database '${config.id}' not found`);
    }

    // Don't allow updating connection while active
    if (existing.status === 'active' && config.connection) {
      throw new Error('Cannot update connection while database is active. Deactivate first.');
    }

    // Don't persist cubeApiUrl if it matches the env var default — the runtime
    // fallback handles it and avoids baking in environment-specific hostnames
    const globalConfig = getConfig();
    const updateConfig = config.cubeApiUrl === globalConfig.CUBE_API_URL
      ? { ...config, cubeApiUrl: null }
      : config;
    const updated = this.store.update(updateConfig, tenantId);
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

    const existing = this.store.get(id, tenantId);
    if (!existing) {
      return false;
    }

    // Don't allow deleting while active
    if (existing.status === 'active') {
      throw new Error('Cannot delete an active database. Deactivate first.');
    }

    // Don't allow deleting the default database (slug-based check catches
    // both 'default' in self-hosted and 'default-{hash}' in SaaS)
    if (existing.slug === 'default') {
      throw new Error('Cannot delete the default database');
    }

    const deleted = this.store.delete(id, tenantId);
    if (deleted) {
      this.emit({ type: 'deleted', databaseId: id });
      // Export updated connections for Cube.js
      await this.exportConnectionsForCube();
    }
    return deleted;
  }

  /**
   * Test database connection
   */
  async testConnection(id: string, tenantId?: string): Promise<DatabaseTestResult> {
    const config = this.store.get(id, tenantId);
    if (!config) {
      return { success: false, message: `Database '${id}' not found` };
    }

    const startTime = Date.now();

    try {
      // For now, we just test that the configuration is valid
      // In a full implementation, we would actually connect to the database
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

      // TODO: Actually test the connection
      // For now, return success if config looks valid
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

    const config = this.store.get(id, tenantId);
    if (!config) {
      throw new Error(`Database '${id}' not found`);
    }

    if (config.status === 'active') {
      return; // Already active
    }

    // Test connection first
    const testResult = await this.testConnection(id, tenantId);
    if (!testResult.success) {
      this.store.updateStatus(id, 'error', testResult.message, tenantId);
      throw new Error(`Connection test failed: ${testResult.message}`);
    }

    // Update status to active
    this.store.updateStatus(id, 'active', undefined, tenantId);
    this.emit({ type: 'activated', databaseId: id });

    // Export updated connections for Cube.js
    await this.exportConnectionsForCube();
  }

  /**
   * Deactivate a database (stop serving MCP endpoints)
   */
  async deactivateDatabase(id: string, tenantId?: string): Promise<void> {
    logger.info({ id, tenantId }, 'Deactivating database');

    const config = this.store.get(id, tenantId);
    if (!config) {
      throw new Error(`Database '${id}' not found`);
    }

    if (config.status === 'inactive') {
      return; // Already inactive
    }

    // Update status to inactive
    this.store.updateStatus(id, 'inactive', undefined, tenantId);
    this.emit({ type: 'deactivated', databaseId: id });

    // Export updated connections for Cube.js
    await this.exportConnectionsForCube();
  }

  /**
   * Export active database connections to JSON for Cube.js driverFactory
   * This file is read by Cube.js to route queries to the correct database
   * Exports ALL connection fields to support all database types
   * Note: exports ALL active databases across all tenants (Cube.js serves all)
   */
  async exportConnectionsForCube(): Promise<void> {
    const connections: Record<string, {
      type: string;
      // Relational DBs (postgres, mysql, redshift, clickhouse)
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean;
      // BigQuery
      projectId?: string;
      // Snowflake
      account?: string;
      warehouse?: string;
      // Additional options (credentials, keyFilename, role, region, location, etc.)
      options?: Record<string, unknown>;
    }> = {};

    // No tenantId filter — export ALL active databases for Cube.js
    const databases = this.listActiveDatabases();
    for (const db of databases) {
      if (db.connection) {
        // Export the full connection object - different DB types need different fields
        connections[db.id] = {
          type: db.connection.type,
          // Relational DBs (postgres, mysql, redshift, clickhouse)
          host: db.connection.host,
          port: db.connection.port,
          database: db.connection.database,
          user: db.connection.user,
          password: db.connection.password,
          ssl: db.connection.ssl,
          // BigQuery
          projectId: db.connection.projectId,
          // Snowflake
          account: db.connection.account,
          warehouse: db.connection.warehouse,
          // Additional options
          options: db.connection.options,
        };
      }
    }

    const exportPath = join(this.dataDir, 'cube-connections.json');
    await writeFile(exportPath, JSON.stringify(connections, null, 2));
    logger.info({ path: exportPath, count: Object.keys(connections).length }, 'Exported database connections for Cube.js');
  }

  /**
   * Initialize the default database if it doesn't exist.
   * Uses a tenant-scoped ID so each tenant gets its own globally unique database.
   * Returns the database ID that was created (or already existed).
   */
  async initializeDefaultDatabase(tenantId?: string): Promise<string> {
    // scopeDatabaseId('default', tenantId) produces the same result as defaultDatabaseId(tenantId)
    const dbId = defaultDatabaseId(tenantId);

    if (this.store.exists(dbId)) {
      logger.debug({ dbId }, 'Default database already exists');
      return dbId;
    }

    logger.info({ dbId, tenantId }, 'Creating default database');

    const globalConfig = getConfig();

    // Pass 'default' as the slug — createDatabase will scope it to dbId
    await this.createDatabase({
      id: 'default',
      name: 'Default Database',
      description: 'Default database configured via environment variables',
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

    // Copy existing agent_catalog.yaml if it exists
    const existingCatalogPath = globalConfig.AGENT_CATALOG_PATH;
    if (existsSync(existingCatalogPath)) {
      const defaultCatalogPath = this.getCatalogPath(dbId);
      try {
        copyFileSync(existingCatalogPath, defaultCatalogPath);
        logger.info('Copied existing agent_catalog.yaml to default database');
      } catch (err) {
        logger.warn({ error: err }, 'Failed to copy existing agent_catalog.yaml');
      }
    }

    // Copy existing cube YAML files if they exist
    // Default cube model path is cube/model/cubes relative to the project root
    const existingCubeDir = join(dirname(this.dataDir), 'cube', 'model', 'cubes');
    const defaultCubeDir = this.getCubeModelPath(dbId) + '/cubes';
    if (existsSync(existingCubeDir)) {
      try {
        const files = readdirSync(existingCubeDir);
        for (const file of files) {
          if (file.endsWith('.yml') || file.endsWith('.yaml')) {
            const srcPath = join(existingCubeDir, file);
            const destPath = join(defaultCubeDir, file);
            copyFileSync(srcPath, destPath);
            logger.debug({ file }, 'Copied cube file to default database');
          }
        }
        if (files.some(f => f.endsWith('.yml') || f.endsWith('.yaml'))) {
          logger.info('Copied existing cube YAML files to default database');
        }
      } catch (err) {
        logger.warn({ error: err }, 'Failed to copy existing cube files');
      }
    }

    // Activate by default (also exports connections for Cube.js)
    await this.activateDatabase(dbId, tenantId);

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
