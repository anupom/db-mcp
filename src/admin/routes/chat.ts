import { Router, Request, Response } from 'express';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, stepCountIs, convertToModelMessages, UIMessage } from 'ai';
import { createMCPClient, MCPClient } from '@ai-sdk/mcp';
import { getLogger } from '../../utils/logger.js';
import { getConfig } from '../../config.js';
import { verifyDatabaseAccess } from '../middleware/database-access.js';
import { getInternalSecret } from '../../auth/internal-secret.js';

const router = Router();
const logger = getLogger().child({ component: 'chat' });

router.post('/', async (req: Request, res: Response) => {
  const databaseId = verifyDatabaseAccess(req, res);
  if (!databaseId) return;

  const { messages: uiMessages } = req.body as { messages: UIMessage[] };

  if (!uiMessages || !Array.isArray(uiMessages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
    return;
  }

  let mcpClient: MCPClient | undefined;
  try {
    const config = getConfig();
    mcpClient = await createMCPClient({
      transport: {
        type: 'http',
        url: `http://localhost:${config.MCP_HTTP_PORT}/mcp/${databaseId}`,
        headers: {
          'X-Internal-Secret': getInternalSecret(),
        },
      },
    });

    const tools = await mcpClient.tools();

    logger.info({ databaseId, tools: Object.keys(tools) }, 'Chat request with MCP tools');

    const messages = await convertToModelMessages(uiMessages);

    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `You are a helpful data assistant for a semantic analytics layer. You help users explore and query data through the available tools.

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
      stopWhen: stepCountIs(25),
      onStepFinish: (step) => {
        logger.debug({ databaseId, finishReason: step.finishReason, toolCalls: step.toolCalls.length, usage: step.usage }, 'Step completed');
      },
      onFinish: async () => {
        await mcpClient?.close();
      },
    });

    result.pipeUIMessageStreamToResponse(res);
  } catch (error) {
    logger.error({ error, databaseId }, 'Chat error');
    await mcpClient?.close();

    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to process chat request',
      });
    }
  }
});

export default router;
