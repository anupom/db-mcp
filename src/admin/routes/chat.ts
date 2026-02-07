import { Router, Request, Response } from 'express';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, pipeUIMessageStreamToResponse, stepCountIs, convertToModelMessages, UIMessage, tool } from 'ai';
import { z } from 'zod';
import { getDatabaseManager } from '../../registry/manager.js';
import { DatabaseMcpHandler } from '../../mcp/handler.js';
import { getLogger } from '../../utils/logger.js';

const router = Router();
const logger = getLogger().child({ component: 'chat' });

// Handler cache - reuse across requests for the same database
const handlers = new Map<string, DatabaseMcpHandler>();

async function getHandler(databaseId: string): Promise<DatabaseMcpHandler> {
  let handler = handlers.get(databaseId);
  if (handler && handler.isReady()) {
    return handler;
  }

  const manager = getDatabaseManager();
  const config = manager.getDatabase(databaseId);
  if (!config) {
    throw new Error(`Database '${databaseId}' not found`);
  }
  if (config.status !== 'active') {
    throw new Error(`Database '${databaseId}' is not active`);
  }

  handler = new DatabaseMcpHandler(config);
  await handler.initialize();
  handlers.set(databaseId, handler);
  logger.info({ databaseId }, 'Created chat handler for database');
  return handler;
}

/**
 * Create Vercel AI SDK tools that call handler methods directly (in-process).
 * No child process or MCP protocol overhead.
 */
function createTools(handler: DatabaseMcpHandler) {
  return {
    catalog_search: tool({
      description:
        'Search the data catalog for available measures, dimensions, and segments. Use this to discover what data is available for querying.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search query for finding members'),
        types: z
          .array(z.enum(['measure', 'dimension', 'segment', 'timeDimension']))
          .optional()
          .describe('Filter by member types'),
        cubes: z.array(z.string()).optional().describe('Filter by cube names'),
        limit: z.number().int().positive().max(50).optional().default(10).describe('Maximum results'),
      }),
      execute: async (args) => {
        const results = handler.catalogIndex.search({
          query: args.query,
          types: args.types,
          cubes: args.cubes,
          limit: args.limit,
        });
        return {
          results: results.map((r) => ({
            name: r.member.name,
            type: r.member.type,
            title: r.member.title,
            description: r.member.description,
            cube: r.member.cubeName,
            score: r.score,
          })),
          count: results.length,
        };
      },
    }),

    catalog_describe: tool({
      description:
        'Get detailed information about a specific member including its definition, type, and related members.',
      inputSchema: z.object({
        member: z.string().min(1).describe('Full member name (e.g., "Orders.count")'),
      }),
      execute: async (args) => {
        const result = handler.catalogIndex.describe(args.member);
        return {
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
        };
      },
    }),

    query_semantic: tool({
      description:
        'Execute a governed semantic query against the data warehouse. Queries are validated against governance policies before execution.',
      inputSchema: z.object({
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
      }),
      execute: async (args) => {
        return await handler.querySemantic.execute(args);
      },
    }),
  };
}

router.post('/', async (req: Request, res: Response) => {
  const databaseId = (req.query.database as string) || 'default';
  const { messages: uiMessages } = req.body as { messages: UIMessage[] };

  if (!uiMessages || !Array.isArray(uiMessages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
    return;
  }

  try {
    const handler = await getHandler(databaseId);
    const tools = createTools(handler);

    logger.info({ databaseId, tools: Object.keys(tools) }, 'Chat request with in-process tools');

    const messages = await convertToModelMessages(uiMessages);

    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: `You are a helpful data assistant for a semantic layer built on Cube.js. You help users explore and query data through the available tools.

Available capabilities:
- Search the catalog to find measures, dimensions, and cubes
- Describe members to understand what data is available
- Query data using measures and dimensions
- Validate queries before execution

Guidelines:
- When users ask about available data, use catalog_search first to discover what's available
- Use catalog_describe to get details about specific measures or dimensions
- Always validate queries before executing them
- Present query results in a clear, readable format
- If a query fails validation, explain the errors and suggest corrections
- Be concise but helpful in your explanations`,
      messages,
      tools,
      stopWhen: stepCountIs(10),
    });

    pipeUIMessageStreamToResponse({
      response: res,
      stream: result.toUIMessageStream(),
    });
  } catch (error) {
    logger.error({ error, databaseId }, 'Chat error');

    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to process chat request',
      });
    }
  }
});

export default router;
