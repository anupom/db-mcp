import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createCubeClient, CubeClient } from '../cube/client.js';
import { createCatalogIndex, CatalogIndex } from '../catalog/index.js';
import { createPolicyEnforcer, PolicyEnforcer } from '../policy/enforcer.js';
import { createQuerySemantic, QuerySemantic } from '../query/semantic.js';
import { DbMcpError } from '../errors.js';
import { getLogger, auditLog } from '../utils/logger.js';
import type { CubeQuery } from '../types.js';
import type { DatabaseConfig } from '../registry/types.js';

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

/**
 * Database-specific MCP handler that holds instances for a single database
 */
export class DatabaseMcpHandler {
  public readonly databaseId: string;
  public readonly cubeClient: CubeClient;
  public readonly catalogIndex: CatalogIndex;
  public readonly policyEnforcer: PolicyEnforcer;
  public readonly querySemantic: QuerySemantic;
  private logger = getLogger().child({ component: 'DatabaseMcpHandler' });
  private initialized = false;

  constructor(config: DatabaseConfig) {
    this.databaseId = config.id;
    this.logger = this.logger.child({ databaseId: config.id });

    // Create database-specific instances
    this.cubeClient = createCubeClient({
      baseUrl: config.cubeApiUrl,
      jwtSecret: config.jwtSecret,
      databaseId: config.id,
    });

    this.catalogIndex = createCatalogIndex(
      {
        databaseId: config.id,
      },
      this.cubeClient
    );

    this.policyEnforcer = createPolicyEnforcer(
      {
        maxLimit: config.maxLimit,
        denyMembers: config.denyMembers,
        defaultSegments: config.defaultSegments,
        returnSql: config.returnSql,
        databaseId: config.id,
      },
      this.catalogIndex
    );

    this.querySemantic = createQuerySemantic(
      { databaseId: config.id },
      this.cubeClient,
      this.policyEnforcer
    );

    this.logger.info('DatabaseMcpHandler created');
  }

  /**
   * Initialize the handler (lazy initialization of catalog index)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('Initializing DatabaseMcpHandler');
    await this.catalogIndex.initialize();
    this.initialized = true;
    this.logger.info('DatabaseMcpHandler initialized');
  }

  /**
   * Check if the handler is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Create an MCP Server instance configured for this database
   */
  createServer(): Server {
    const server = new Server(
      {
        name: `db-mcp-${this.databaseId}`,
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers(server);
    return server;
  }

  private setupHandlers(server: Server): void {
    // List tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'catalog_search',
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
            name: 'catalog_describe',
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
            name: 'query_semantic',
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
        // Ensure handler is initialized
        await this.initialize();

        switch (name) {
          case 'catalog_search':
            return await this.handleCatalogSearch(args);
          case 'catalog_describe':
            return await this.handleCatalogDescribe(args);
          case 'query_semantic':
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
      databaseId: this.databaseId,
    });

    const results = this.catalogIndex.search({
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
      databaseId: this.databaseId,
    });

    const result = this.catalogIndex.describe(input.member);

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

    const result = await this.querySemantic.execute(query);

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
        databaseId: this.databaseId,
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
        databaseId: this.databaseId,
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
      databaseId: this.databaseId,
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
}
