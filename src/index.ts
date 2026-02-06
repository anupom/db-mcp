import { loadConfig, getConfig } from './config.js';
import { McpServer } from './mcp/server.js';
import { getLogger } from './utils/logger.js';

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

    const server = new McpServer();
    await server.start();
  } catch (err) {
    console.error('Failed to start DB-MCP:', err);
    process.exit(1);
  }
}

main();
