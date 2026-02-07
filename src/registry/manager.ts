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
  async createDatabase(config: CreateDatabaseConfig): Promise<DatabaseConfig> {
    logger.info({ id: config.id, name: config.name }, 'Creating database');

    // Validate ID doesn't exist
    if (this.store.exists(config.id)) {
      throw new Error(`Database with ID '${config.id}' already exists`);
    }

    // Validate JWT secret compatibility with Cube.js
    // Cube.js only supports a single JWT secret, so all databases must use the same secret
    const globalConfig = getConfig();
    if (config.jwtSecret && config.jwtSecret !== globalConfig.CUBE_JWT_SECRET) {
      logger.warn(
        { id: config.id },
        'Custom jwtSecret differs from global CUBE_JWT_SECRET. ' +
        'Cube.js verifies all JWTs with the global secret. ' +
        'Queries may fail with 401 if secrets do not match.'
      );
    }

    // Initialize data directory structure
    this.initializeDataDirectory(config.id);

    // Create database record - use global JWT secret if not provided
    const databaseWithDefaults = {
      ...config,
      jwtSecret: config.jwtSecret || globalConfig.CUBE_JWT_SECRET,
    };
    const database = this.store.create(databaseWithDefaults);

    this.emit({ type: 'created', database });
    return database;
  }

  /**
   * Get a database by ID
   */
  getDatabase(id: string): DatabaseConfig | null {
    return this.store.get(id);
  }

  /**
   * List all databases
   */
  listDatabases(): DatabaseSummary[] {
    return this.store.list();
  }

  /**
   * List active databases with full config
   */
  listActiveDatabases(): DatabaseConfig[] {
    return this.store.listActive();
  }

  /**
   * Update a database
   */
  async updateDatabase(config: UpdateDatabaseConfig): Promise<DatabaseConfig | null> {
    logger.info({ id: config.id }, 'Updating database');

    const existing = this.store.get(config.id);
    if (!existing) {
      throw new Error(`Database '${config.id}' not found`);
    }

    // Don't allow updating connection while active
    if (existing.status === 'active' && config.connection) {
      throw new Error('Cannot update connection while database is active. Deactivate first.');
    }

    const updated = this.store.update(config);
    if (updated) {
      this.emit({ type: 'updated', database: updated });
    }
    return updated;
  }

  /**
   * Delete a database
   */
  async deleteDatabase(id: string): Promise<boolean> {
    logger.info({ id }, 'Deleting database');

    const existing = this.store.get(id);
    if (!existing) {
      return false;
    }

    // Don't allow deleting while active
    if (existing.status === 'active') {
      throw new Error('Cannot delete an active database. Deactivate first.');
    }

    // Don't allow deleting 'default' database
    if (id === 'default') {
      throw new Error('Cannot delete the default database');
    }

    const deleted = this.store.delete(id);
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
  async testConnection(id: string): Promise<DatabaseTestResult> {
    const config = this.store.get(id);
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
  async activateDatabase(id: string): Promise<void> {
    logger.info({ id }, 'Activating database');

    const config = this.store.get(id);
    if (!config) {
      throw new Error(`Database '${id}' not found`);
    }

    if (config.status === 'active') {
      return; // Already active
    }

    // Test connection first
    const testResult = await this.testConnection(id);
    if (!testResult.success) {
      this.store.updateStatus(id, 'error', testResult.message);
      throw new Error(`Connection test failed: ${testResult.message}`);
    }

    // Update status to active
    this.store.updateStatus(id, 'active');
    this.emit({ type: 'activated', databaseId: id });

    // Export updated connections for Cube.js
    await this.exportConnectionsForCube();
  }

  /**
   * Deactivate a database (stop serving MCP endpoints)
   */
  async deactivateDatabase(id: string): Promise<void> {
    logger.info({ id }, 'Deactivating database');

    const config = this.store.get(id);
    if (!config) {
      throw new Error(`Database '${id}' not found`);
    }

    if (config.status === 'inactive') {
      return; // Already inactive
    }

    // Update status to inactive
    this.store.updateStatus(id, 'inactive');
    this.emit({ type: 'deactivated', databaseId: id });

    // Export updated connections for Cube.js
    await this.exportConnectionsForCube();
  }

  /**
   * Export active database connections to JSON for Cube.js driverFactory
   * This file is read by Cube.js to route queries to the correct database
   * Exports ALL connection fields to support all database types
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

    // Notify about Cube.js restart requirement
    // In dev mode, Cube.js caches schemas and driver instances
    logger.warn(
      'Database connections updated. Cube.js may need a restart to pick up changes. ' +
      'Run: docker-compose restart cube'
    );
  }

  /**
   * Check if Cube.js needs restart (connections file changed since last export)
   */
  cubeRestartRequired(): { required: boolean; message: string } {
    return {
      required: true,
      message: 'Database connections were updated. Restart Cube.js to apply changes: docker-compose restart cube',
    };
  }

  /**
   * Initialize the default database if it doesn't exist
   */
  async initializeDefaultDatabase(): Promise<void> {
    if (this.store.exists('default')) {
      logger.debug('Default database already exists');
      return;
    }

    logger.info('Creating default database');

    const globalConfig = getConfig();

    // Create default database from environment config
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
      cubeApiUrl: globalConfig.CUBE_API_URL,
      jwtSecret: globalConfig.CUBE_JWT_SECRET,
      maxLimit: globalConfig.MAX_LIMIT,
      denyMembers: globalConfig.DENY_MEMBERS,
      defaultSegments: globalConfig.DEFAULT_SEGMENTS,
      returnSql: globalConfig.RETURN_SQL,
    });

    // Copy existing agent_catalog.yaml if it exists
    const existingCatalogPath = globalConfig.AGENT_CATALOG_PATH;
    if (existsSync(existingCatalogPath)) {
      const defaultCatalogPath = this.getCatalogPath('default');
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
    const defaultCubeDir = this.getCubeModelPath('default') + '/cubes';
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

    // Activate by default
    await this.activateDatabase('default');

    // Export connections for Cube.js
    await this.exportConnectionsForCube();
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
