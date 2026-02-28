import 'dotenv/config';
import { loadConfig, getConfig } from './config.js';
import { McpServer } from './mcp/server.js';
import { getLogger } from './utils/logger.js';
import { initializeDatabaseStore } from './registry/pg-store.js';
import { syncAllToDisk } from './registry/fs-sync.js';
import { getDatabaseManager } from './registry/manager.js';
import { isAuthEnabled } from './auth/config.js';

async function main(): Promise<void> {
  try {
    // Load and validate configuration
    loadConfig();
    const config = getConfig();

    const logger = getLogger();
    logger.info(
      {
        stdio: config.MCP_STDIO_ENABLED,
        http: config.MCP_HTTP_ENABLED,
        httpPort: config.MCP_HTTP_ENABLED ? config.MCP_HTTP_PORT : undefined,
      },
      'Starting DB-MCP server'
    );

    // Initialize PostgreSQL store (creates dbmcp schema + tables)
    await initializeDatabaseStore(config.ADMIN_SECRET);

    // Auto-initialize default database if none exist (self-hosted mode only)
    const manager = getDatabaseManager();
    const databases = await manager.listDatabases();
    if (databases.length === 0 && !isAuthEnabled()) {
      logger.info('No databases configured, initializing default from environment');
      await manager.initializeDefaultDatabase();
    } else {
      logger.info({ count: databases.length }, 'Found existing databases');
    }

    // Sync all data from PG to filesystem for Cube.js
    await syncAllToDisk();

    const server = new McpServer();
    await server.start();
  } catch (err) {
    console.error('Failed to start DB-MCP:', err);
    process.exit(1);
  }
}

main();
