import { Router, Request, Response } from 'express';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, pipeUIMessageStreamToResponse, stepCountIs, convertToModelMessages, UIMessage } from 'ai';
import { createMCPClient, MCPTransport } from '@ai-sdk/mcp';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';

const router = Router();

// Path to built MCP server (relative to where the built JS will be: dist/routes/chat.js)
const MCP_SERVER_PATH = path.resolve(process.cwd(), 'dist/index.js');

/**
 * Adapter to convert StdioClientTransport from MCP SDK to the MCPTransport interface expected by @ai-sdk/mcp
 */
class StdioMCPTransportAdapter implements MCPTransport {
  private stdioTransport: StdioClientTransport;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(params: StdioServerParameters) {
    this.stdioTransport = new StdioClientTransport(params);

    // Wire up event handlers
    this.stdioTransport.onclose = () => {
      if (this.onclose) this.onclose();
    };
    this.stdioTransport.onerror = (error) => {
      if (this.onerror) this.onerror(error);
    };
    this.stdioTransport.onmessage = (message) => {
      if (this.onmessage) this.onmessage(message);
    };
  }

  async start(): Promise<void> {
    await this.stdioTransport.start();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await this.stdioTransport.send(message);
  }

  async close(): Promise<void> {
    await this.stdioTransport.close();
  }
}

// Get the path to MCP server - we're in admin/backend, MCP server is at root
function getMCPServerPath(): string {
  // When running from admin/backend, we need to go up two directories to get to the MCP server
  return path.resolve(__dirname, '..', '..', '..', '..', 'dist', 'index.js');
}

// Transform MCP tool names (with dots) to Anthropic-compatible names (with underscores)
// MCP allows dots in tool names, but Anthropic API only allows [a-zA-Z0-9_-]
function transformToolNamesForAnthropic<T extends Record<string, unknown>>(tools: T): T {
  const transformed: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    // Replace dots with underscores for Anthropic compatibility
    // e.g., catalog.search -> catalog_search
    const anthropicName = name.replace(/\./g, '_');
    transformed[anthropicName] = tool;
  }
  return transformed as T;
}

router.post('/', async (req: Request, res: Response) => {
  const databaseId = (req.query.database as string) || 'default';
  const { messages: uiMessages } = req.body as { messages: UIMessage[] };

  if (!uiMessages || !Array.isArray(uiMessages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
    return;
  }

  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

  try {
    const mcpServerPath = getMCPServerPath();
    console.log('Connecting to MCP server at:', mcpServerPath, 'for database:', databaseId);

    // Create MCP transport using stdio adapter
    const transport = new StdioMCPTransportAdapter({
      command: 'node',
      args: [mcpServerPath],
      env: {
        ...process.env as Record<string, string>,
        CUBE_API_URL: process.env.CUBE_API_URL || 'http://localhost:4000/cubejs-api/v1',
        CUBE_JWT_SECRET: process.env.CUBE_JWT_SECRET || 'your-super-secret-key-min-32-chars',
        DATABASE_ID: databaseId,
      },
    });

    // Connect to MCP server
    mcpClient = await createMCPClient({ transport });

    // Auto-discover tools from MCP and transform names for Anthropic compatibility
    const mcpTools = await mcpClient.tools();
    const tools = transformToolNamesForAnthropic(mcpTools);

    console.log('MCP tools discovered:', Object.keys(mcpTools));
    console.log('Tools for Anthropic:', Object.keys(tools));

    // Convert UI messages to model messages format
    const messages = await convertToModelMessages(uiMessages);

    // Stream response with tool use
    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: `You are a helpful data assistant for a semantic layer built on Cube.js. You help users explore and query data through the available tools.

Available capabilities:
- Search the catalog to find measures, dimensions, and cubes
- Describe members to understand what data is available
- Query data using measures and dimensions
- Validate queries before execution

Guidelines:
- When users ask about available data, use catalog_search (or catalog.search) first to discover what's available
- Use catalog_describe (or catalog.describe) to get details about specific measures or dimensions
- Always validate queries before executing them
- Present query results in a clear, readable format
- If a query fails validation, explain the errors and suggest corrections
- Be concise but helpful in your explanations`,
      messages,
      tools,
      stopWhen: stepCountIs(10), // Allow up to 10 steps for tool use
      onFinish: async () => {
        if (mcpClient) {
          await mcpClient.close();
        }
      },
    });

    // Pipe UI message stream for frontend useChat compatibility
    pipeUIMessageStreamToResponse({
      response: res,
      stream: result.toUIMessageStream(),
    });
  } catch (error) {
    console.error('Chat error:', error);

    // Clean up MCP client on error
    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch {
        // Ignore cleanup errors
      }
    }

    // If headers haven't been sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to process chat request'
      });
    }
  }
});

export default router;
