import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import express from 'express';
import { getCatalogIndex } from '../catalog/index.js';
import { getQuerySemantic } from '../query/semantic.js';
import { DbMcpError } from '../errors.js';
import { getLogger, auditLog } from '../utils/logger.js';
import type { CubeQuery } from '../types.js';
import { getConfig } from '../config.js';

// Tool input schemas
const catalogSearchSchema = z.object({
  query: z.string().min(1).describe('Search query for finding members'),
  types: z
    .array(z.enum(['measure', 'dimension', 'segment', 'timeDimension']))
    .optional()
    .describe('Filter by member types'),
  cubes: z.array(z.string()).optional().describe('Filter by cube names'),
  limit: z.number().int().positive().max(50).optional().default(10).describe('Maximum results'),
});

const catalogDescribeSchema = z.object({
  member: z.string().min(1).describe('Full member name (e.g., "Orders.count")'),
});

const querySemanticSchema = z.object({
  measures: z.array(z.string()).optional().describe('Measures to query'),
  dimensions: z.array(z.string()).optional().describe('Dimensions for grouping'),
  timeDimensions: z
    .array(
      z.object({
        dimension: z.string(),
        granularity: z.string().optional(),
        dateRange: z.union([z.string(), z.tuple([z.string(), z.string()])]).optional(),
      })
    )
    .optional()
    .describe('Time dimensions with optional granularity and date range'),
  filters: z
    .array(
      z.object({
        member: z.string().optional(),
        dimension: z.string().optional(),
        operator: z.string(),
        values: z.array(z.string()).optional(),
      })
    )
    .optional()
    .describe('Filter conditions'),
  segments: z.array(z.string()).optional().describe('Segments to apply'),
  order: z
    .union([
      z.record(z.enum(['asc', 'desc'])),
      z.array(z.tuple([z.string(), z.enum(['asc', 'desc'])])),
    ])
    .optional()
    .describe('Sort order'),
  limit: z.number().int().positive().describe('Maximum rows to return (required)'),
  offset: z.number().int().nonnegative().optional().describe('Number of rows to skip'),
});

export class McpServer {
  private servers: Server[] = [];
  private logger = getLogger().child({ component: 'McpServer' });

  private createServer(): Server {
    const server = new Server(
      {
        name: 'db-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers(server);
    this.servers.push(server);
    return server;
  }

  private setupHandlers(server: Server): void {
    // List tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'catalog.search',
            description:
              'Search the data catalog for available measures, dimensions, and segments. Use this to discover what data is available for querying.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for finding members',
                },
                types: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['measure', 'dimension', 'segment', 'timeDimension'],
                  },
                  description: 'Filter by member types',
                },
                cubes: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by cube names',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results (default: 10, max: 50)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'catalog.describe',
            description:
              'Get detailed information about a specific member including its definition, type, and related members.',
            inputSchema: {
              type: 'object',
              properties: {
                member: {
                  type: 'string',
                  description: 'Full member name (e.g., "Orders.count")',
                },
              },
              required: ['member'],
            },
          },
          {
            name: 'query.semantic',
            description:
              'Execute a governed semantic query against the data warehouse. Queries are validated against governance policies before execution.',
            inputSchema: {
              type: 'object',
              properties: {
                measures: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Measures to query',
                },
                dimensions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Dimensions for grouping',
                },
                timeDimensions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      dimension: { type: 'string' },
                      granularity: { type: 'string' },
                      dateRange: {
                        oneOf: [
                          { type: 'string' },
                          { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
                        ],
                      },
                    },
                    required: ['dimension'],
                  },
                  description: 'Time dimensions with optional granularity and date range',
                },
                filters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      member: { type: 'string' },
                      dimension: { type: 'string' },
                      operator: { type: 'string' },
                      values: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['operator'],
                  },
                  description: 'Filter conditions',
                },
                segments: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Segments to apply',
                },
                order: {
                  oneOf: [
                    { type: 'object', additionalProperties: { enum: ['asc', 'desc'] } },
                    { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  ],
                  description: 'Sort order',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum rows to return (required)',
                },
                offset: {
                  type: 'number',
                  description: 'Number of rows to skip',
                },
              },
              required: ['limit'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.debug({ tool: name, args }, 'Tool call received');

      try {
        switch (name) {
          case 'catalog.search':
            return await this.handleCatalogSearch(args);
          case 'catalog.describe':
            return await this.handleCatalogDescribe(args);
          case 'query.semantic':
            return await this.handleQuerySemantic(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (err) {
        return this.handleError(name, err);
      }
    });
  }

  private async handleCatalogSearch(args: unknown) {
    const input = catalogSearchSchema.parse(args);

    auditLog({
      event: 'catalog.search',
      tool: 'catalog.search',
      input: { query: input.query, types: input.types, cubes: input.cubes },
    });

    const catalog = await getCatalogIndex();
    const results = catalog.search({
      query: input.query,
      types: input.types,
      cubes: input.cubes,
      limit: input.limit,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              results: results.map((r) => ({
                name: r.member.name,
                type: r.member.type,
                title: r.member.title,
                description: r.member.description,
                cube: r.member.cubeName,
                score: r.score,
              })),
              count: results.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleCatalogDescribe(args: unknown) {
    const input = catalogDescribeSchema.parse(args);

    auditLog({
      event: 'catalog.describe',
      tool: 'catalog.describe',
      input: { member: input.member },
    });

    const catalog = await getCatalogIndex();
    const result = catalog.describe(input.member);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              member: {
                name: result.member.name,
                type: result.member.type,
                title: result.member.title,
                description: result.member.description,
                cube: result.member.cubeName,
                memberType: result.member.memberType,
                exposed: result.member.exposed,
                pii: result.member.pii,
                format: result.member.format,
                aggType: result.member.aggType,
                drillMembers: result.member.drillMembers,
                granularities: result.member.granularities,
                allowedGroupBy: result.member.allowedGroupBy,
                deniedGroupBy: result.member.deniedGroupBy,
              },
              relatedMembers: result.relatedMembers,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleQuerySemantic(args: unknown) {
    const input = querySemanticSchema.parse(args);
    const query: CubeQuery = input;

    const querySemantic = getQuerySemantic();
    const result = await querySemantic.execute(query);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private handleError(tool: string, err: unknown) {
    this.logger.error({ tool, error: err }, 'Tool error');

    if (err instanceof DbMcpError) {
      auditLog({
        event: 'error',
        tool,
        error: { code: err.code, message: err.message },
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(err.toJSON(), null, 2),
          },
        ],
        isError: true,
      };
    }

    if (err instanceof z.ZodError) {
      const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');

      auditLog({
        event: 'error',
        tool,
        error: { code: 'VALIDATION_ERROR', message },
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid input',
                  details: err.errors,
                },
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    if (err instanceof McpError) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);

    auditLog({
      event: 'error',
      tool,
      error: { code: 'INTERNAL_ERROR', message },
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message,
              },
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  async start(): Promise<void> {
    const config = getConfig();
    const startPromises: Promise<void>[] = [];

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

  private async startStdio(): Promise<void> {
    const server = this.createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    this.logger.info('MCP server started on stdio');
  }

  private async startHttpServer(): Promise<void> {
    const config = getConfig();
    const app = express();
    app.use(express.json());

    // Store active transports by session ID
    const transports = new Map<string, StreamableHTTPServerTransport>();

    // Handle MCP requests
    app.all('/mcp', async (req, res) => {
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
          const server = this.createServer();

          // Clean up on close
          transport.onclose = () => {
            const id = transport.sessionId;
            if (id) {
              transports.delete(id);
              this.logger.debug({ sessionId: id }, 'MCP session closed');
            }
          };

          // Connect transport to server
          await server.connect(transport);
          await transport.handleRequest(req, res);
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
        await transport.handleRequest(req, res);
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
        await transport.handleRequest(req, res);
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
    });

    // Health check endpoint
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', transport: 'http', sessions: transports.size });
    });

    const port = config.MCP_HTTP_PORT;
    const host = config.MCP_HTTP_HOST;

    app.listen(port, host, () => {
      this.logger.info({ port, host }, `MCP server started on http://${host}:${port}/mcp`);
    });
  }
}
