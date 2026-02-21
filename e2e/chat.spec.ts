import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('Chat API - MCP Integration', () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerRunning();
  });

  it('chat endpoint returns 400 for missing messages', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/chat?database=default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('messages array is required');
  });

  it('chat endpoint connects to MCP and responds', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/chat?database=default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: 'test-1',
            role: 'user',
            content: 'What measures are available?',
            parts: [{ type: 'text', text: 'What measures are available?' }],
          },
        ],
      }),
    });

    // May be 200 (streaming) or 500 (no ANTHROPIC_API_KEY)
    if (response.status === 500) {
      const body = await response.json();
      expect(body.error).toBeTruthy();
      // API key error is expected in test env; MCP connection error is not
      const isMcpError = body.error.includes('MCP') || body.error.includes('ECONNREFUSED');
      if (isMcpError) {
        throw new Error(`MCP connection failed: ${body.error}`);
      }
      expect(body.error).toContain('ANTHROPIC_API_KEY');
    } else {
      expect(response.status).toBe(200);
    }
  });

  it('MCP tools endpoint returns available tools', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/mcp/tools`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.tools).toBeDefined();
    expect(Array.isArray(body.tools)).toBe(true);

    const toolNames = body.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('catalog_search');
    expect(toolNames).toContain('catalog_describe');
    expect(toolNames).toContain('query_semantic');
  });
});
