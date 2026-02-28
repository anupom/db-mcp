import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getLogger } from '../utils/logger.js';
import { getConfig } from '../config.js';
import { getDatabaseManager } from '../registry/manager.js';
import { DatabaseMcpHandler } from './handler.js';
import adminRoutes, { healthCheck } from '../admin/index.js';
import { clerkSessionMiddleware } from '../auth/middleware.js';
import { validateMcpApiKey } from '../auth/api-key-middleware.js';
import { isAuthEnabled } from '../auth/config.js';

export class McpServer {
  private servers: Server[] = [];
  private logger = getLogger().child({ component: 'McpServer' });

  // Handler cache for multi-database support
  private handlers: Map<string, DatabaseMcpHandler> = new Map();

  // Unsubscribe from registry events
  private unsubscribeFromRegistry?: () => void;

  /**
   * Get or create a handler for a specific database
   */
  async getHandler(databaseId: string, tenantId?: string): Promise<DatabaseMcpHandler> {
    // Check cache first
    let handler = this.handlers.get(databaseId);
    if (handler) {
      // Ensure it's initialized
      if (!handler.isReady()) {
        await handler.initialize();
      }
      return handler;
    }

    // Get database config (tenant-scoped when tenantId is provided)
    const manager = getDatabaseManager();
    const config = await manager.getDatabase(databaseId, tenantId);

    if (!config) {
      throw new Error(`Database '${databaseId}' not found`);
    }

    if (config.status !== 'active') {
      throw new Error(`Database '${databaseId}' is not active`);
    }

    // Create and cache handler
    handler = new DatabaseMcpHandler(config);
    await handler.initialize();
    this.handlers.set(databaseId, handler);

    this.logger.info({ databaseId }, 'Created handler for database');
    return handler;
  }

  /**
   * Remove a handler from cache (call when database is deactivated)
   */
  removeHandler(databaseId: string): void {
    this.handlers.delete(databaseId);
    this.logger.info({ databaseId }, 'Removed handler for database');
  }

  /**
   * Clear all handlers from cache
   */
  clearHandlers(): void {
    this.handlers.clear();
    this.logger.info('Cleared all handlers');
  }

  async start(): Promise<void> {
    const config = getConfig();
    const startPromises: Promise<void>[] = [];

    // Subscribe to database registry events for handler cleanup
    this.subscribeToRegistryEvents();

    if (config.MCP_STDIO_ENABLED) {
      startPromises.push(this.startStdio());
    }

    if (config.MCP_HTTP_ENABLED) {
      startPromises.push(this.startHttpServer());
    }

    if (startPromises.length === 0) {
      throw new Error('No MCP transports enabled. Set MCP_STDIO_ENABLED=true or MCP_HTTP_ENABLED=true');
    }

    await Promise.all(startPromises);
  }

  /**
   * Subscribe to database registry events for handler lifecycle management
   */
  private subscribeToRegistryEvents(): void {
    const manager = getDatabaseManager();
    this.unsubscribeFromRegistry = manager.subscribe((event) => {
      switch (event.type) {
        case 'deactivated':
        case 'deleted':
          // Remove cached handler when database is deactivated or deleted
          if (this.handlers.has(event.databaseId)) {
            this.removeHandler(event.databaseId);
            this.logger.info({ databaseId: event.databaseId, event: event.type }, 'Handler removed due to registry event');
          }
          break;
        case 'updated':
          // Clear handler on update so it will be recreated with new config
          if (this.handlers.has(event.database.id)) {
            this.removeHandler(event.database.id);
            this.logger.info({ databaseId: event.database.id }, 'Handler removed due to config update');
          }
          break;
      }
    });
  }

  private async startStdio(): Promise<void> {
    // Stdio uses DATABASE_ID env var if set, otherwise 'default'
    const databaseId = process.env.DATABASE_ID || 'default';
    const handler = await this.getHandler(databaseId);
    const server = handler.createServer();
    this.servers.push(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);
    this.logger.info({ databaseId }, 'MCP server started on stdio');
  }

  private async startHttpServer(): Promise<void> {
    const config = getConfig();
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(clerkSessionMiddleware());

    // Request logging
    app.use((req, _res, next) => {
      this.logger.debug({ method: req.method, path: req.path }, 'HTTP request');
      next();
    });

    // Database-specific transports: Map<databaseId, Map<sessionId, transport>>
    const dbTransports = new Map<string, Map<string, StreamableHTTPServerTransport>>();

    // Serve static frontend if public/ directory exists (Docker build)
    const publicDir = path.join(process.cwd(), 'public');
    const hasPublicDir = fs.existsSync(publicDir);

    // Health check endpoint (enhanced with database check)
    app.get('/health', async (req, res) => {
      const databaseId = (req.query.database as string) || 'default';
      const dbHealthy = await healthCheck(databaseId);
      const status = dbHealthy ? 'healthy' : 'unhealthy';
      res.status(dbHealthy ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        databaseId,
        transport: 'http',
        databases: dbTransports.size,
        services: {
          database: dbHealthy ? 'connected' : 'disconnected',
        },
      });
    });

    // Mount admin API routes
    app.use('/api', adminRoutes);

    // Redirect /mcp to /mcp/default
    app.all('/mcp', (req, res) => {
      const newUrl = `/mcp/default${req.url.slice(4) || ''}`;
      res.redirect(307, newUrl);
    });

    // Shared MCP request handler
    const handleMcpEndpoint = async (req: express.Request, res: express.Response) => {
      const { databaseId } = req.params;
      const tenantId = req.tenant?.tenantId;

      try {
        const handler = await this.getHandler(databaseId, tenantId);

        let dbTransportMap = dbTransports.get(databaseId);
        if (!dbTransportMap) {
          dbTransportMap = new Map();
          dbTransports.set(databaseId, dbTransportMap);
        }

        await this.handleMcpRequest(req, res, dbTransportMap, () => handler.createServer());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error({ databaseId, error: err }, 'Database MCP request failed');
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message },
          id: null,
        });
      }
    };

    // Tenant-scoped MCP endpoint (SaaS mode, registered first for priority)
    if (isAuthEnabled()) {
      app.all('/mcp/:tenantSlug/:databaseId', validateMcpApiKey(), handleMcpEndpoint);
    }

    // Database-specific MCP endpoint (self-hosted + internal server-to-server)
    app.all('/mcp/:databaseId', validateMcpApiKey(), handleMcpEndpoint);

    // Serve static frontend assets and SPA fallback
    if (hasPublicDir) {
      app.use(express.static(publicDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
      });
    }

    // Error handling
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      this.logger.error({ error: err }, 'Unhandled error');
      res.status(500).json({ error: 'Internal server error' });
    });

    // 404 handler (only reached when no public dir)
    app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    const port = config.MCP_HTTP_PORT;
    const host = config.MCP_HTTP_HOST;

    app.listen(port, host, () => {
      this.logger.info({ port, host }, `MCP server started on http://${host}:${port}/mcp/:databaseId`);
    });
  }

  /**
   * Handle MCP request with session management
   */
  private async handleMcpRequest(
    req: express.Request,
    res: express.Response,
    transports: Map<string, StreamableHTTPServerTransport>,
    createServer: () => Server
  ): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // For POST requests, check if it's initialization or has existing session
    if (req.method === 'POST') {
      // Check if this is a new session (initialization request)
      if (!sessionId) {
        // Create new transport for this session
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports.set(newSessionId, transport);
            this.logger.debug({ sessionId: newSessionId }, 'New MCP session initialized');
          },
        });

        // Create a new server instance for this session
        const server = createServer();
        this.servers.push(server);

        // Clean up on close
        transport.onclose = () => {
          const id = transport.sessionId;
          if (id) {
            transports.delete(id);
            this.logger.debug({ sessionId: id }, 'MCP session closed');
          }
          const idx = this.servers.indexOf(server);
          if (idx !== -1) this.servers.splice(idx, 1);
        };

        // Connect transport to server
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // Existing session - find transport
      const transport = transports.get(sessionId);
      if (!transport) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session not found' },
          id: null,
        });
        return;
      }
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Handle GET for SSE streaming
    if (req.method === 'GET') {
      if (!sessionId) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session ID required for SSE' },
          id: null,
        });
        return;
      }
      const transport = transports.get(sessionId);
      if (!transport) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session not found' },
          id: null,
        });
        return;
      }
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Handle DELETE for session cleanup
    if (req.method === 'DELETE') {
      if (!sessionId) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session ID required' },
          id: null,
        });
        return;
      }
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.close();
        transports.delete(sessionId);
      }
      res.status(204).end();
      return;
    }

    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
  }
}
