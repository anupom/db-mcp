import { Router, Request, Response } from 'express';

const router = Router();

// Tool definitions matching the MCP server
const TOOL_DEFINITIONS = [
  {
    name: 'catalog.search',
    description: 'Fuzzy-search the data catalog for measures, dimensions, and segments',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        types: {
          type: 'array',
          items: { enum: ['measure', 'dimension', 'segment'] },
          description: 'Filter by member types',
        },
        cubes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by cube names',
        },
        limit: { type: 'number', default: 10, description: 'Maximum results to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'catalog.describe',
    description: 'Get detailed information about a specific catalog member',
    inputSchema: {
      type: 'object',
      properties: {
        member: {
          type: 'string',
          description: 'Full member name (e.g., Orders.count, Users.email)',
        },
      },
      required: ['member'],
    },
  },
  {
    name: 'query.semantic',
    description: 'Execute governed semantic queries against the data warehouse',
    inputSchema: {
      type: 'object',
      properties: {
        measures: {
          type: 'array',
          items: { type: 'string' },
          description: 'Measures to aggregate (e.g., ["Orders.count", "Orders.totalAmount"])',
        },
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dimensions to group by (e.g., ["Users.city", "Orders.status"])',
        },
        timeDimensions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              dimension: { type: 'string' },
              granularity: { enum: ['day', 'week', 'month', 'quarter', 'year'] },
              dateRange: { type: 'array', items: { type: 'string' } },
            },
          },
          description: 'Time dimensions for date-based filtering and grouping',
        },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              member: { type: 'string' },
              operator: { type: 'string' },
              values: { type: 'array' },
            },
          },
          description: 'Filters to apply',
        },
        segments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Predefined segments to apply',
        },
        order: {
          type: 'object',
          description: 'Order by member name to direction (asc/desc)',
        },
        limit: {
          type: 'number',
          maximum: 1000,
          description: 'Maximum rows to return (required, max 1000)',
        },
        offset: {
          type: 'number',
          description: 'Number of rows to skip for pagination',
        },
      },
      required: ['limit'],
    },
  },
];

// Server info - dynamically built based on environment
const getServerInfo = () => ({
  name: 'db-mcp',
  version: '1.0.0',
  transports: {
    stdio: process.env.MCP_STDIO_ENABLED !== 'false',
    http: process.env.MCP_HTTP_ENABLED === 'true',
  },
  endpoint: process.env.MCP_HTTP_ENABLED === 'true'
    ? (process.env.MCP_HTTP_URL || `http://localhost:${process.env.MCP_HTTP_PORT || 3002}/mcp`)
    : undefined,
  command: 'node dist/index.js',
  description: 'MCP server for semantic data queries with governance controls',
});

// GET /api/mcp/info - Returns server info
router.get('/info', (_req: Request, res: Response) => {
  res.json(getServerInfo());
});

// GET /api/mcp/tools - Returns tool definitions
router.get('/tools', (_req: Request, res: Response) => {
  res.json({ tools: TOOL_DEFINITIONS });
});

export default router;
