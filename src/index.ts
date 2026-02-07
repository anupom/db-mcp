import 'dotenv/config';
import { loadConfig, getConfig } from './config.js';
import { McpServer } from './mcp/server.js';
import { getLogger } from './utils/logger.js';
import { getDatabaseManager } from './registry/manager.js';

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

    // Auto-initialize default database if none exist
    const manager = getDatabaseManager();
    const databases = manager.listDatabases();
    if (databases.length === 0) {
      logger.info('No databases configured, initializing default from environment');
      await manager.initializeDefaultDatabase();
    } else {
      logger.info({ count: databases.length }, 'Found existing databases');
      // Export connections for Cube.js on startup (for existing databases)
      await manager.exportConnectionsForCube();
    }

    const server = new McpServer();
    await server.start();
  } catch (err) {
    console.error('Failed to start DB-MCP:', err);
    process.exit(1);
  }
}

main();
