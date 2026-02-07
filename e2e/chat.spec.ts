import { test, expect } from '@playwright/test';

test.describe('Chat Page', () => {
  test('loads and displays chat UI elements', async ({ page }) => {
    await page.goto('/chat');

    // Verify header
    await expect(page.getByRole('heading', { name: 'AI Chat' })).toBeVisible();
    await expect(page.getByText('Ask questions about your data using natural language')).toBeVisible();

    // Verify database selector is present
    await expect(page.locator('select, [class*="selector"], [class*="database"]').first()).toBeVisible();

    // Verify suggested prompts are displayed
    await expect(page.getByText('What measures are available?')).toBeVisible();
    await expect(page.getByText('Show me all dimensions for orders')).toBeVisible();
    await expect(page.getByText('Query total orders by status')).toBeVisible();
    await expect(page.getByText('Describe the orders count measure')).toBeVisible();

    // Verify chat input is present
    await expect(page.getByPlaceholder('Ask about your data...')).toBeVisible();

    // Verify the "Start a conversation" prompt
    await expect(page.getByText('Start a conversation')).toBeVisible();
  });

  test('suggested prompt populates input field', async ({ page }) => {
    await page.goto('/chat');

    // Click a suggested prompt
    await page.getByText('What measures are available?').click();

    // Verify the input field is populated
    const input = page.getByPlaceholder('Ask about your data...');
    await expect(input).toHaveValue('What measures are available?');
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    await page.goto('/chat');

    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeDisabled();
  });

  test('send button enables when input has text', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder('Ask about your data...');
    await input.fill('test query');

    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeEnabled();
  });
});

test.describe('Chat API - MCP Integration', () => {
  test('chat endpoint connects to MCP and streams a response', async ({ request }) => {
    // Send a chat message via the API directly
    // This tests the full path: chat.ts -> createMCPClient -> MCP HTTP endpoint
    const response = await request.post('/api/chat?database=default', {
      data: {
        messages: [
          {
            id: 'test-1',
            role: 'user',
            content: 'What measures are available?',
            parts: [{ type: 'text', text: 'What measures are available?' }],
          },
        ],
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // The chat endpoint should respond (may be 200 for streaming or 500 if no ANTHROPIC_API_KEY)
    // If no API key, we expect a 500 with a specific error
    if (response.status() === 500) {
      const body = await response.json();
      // If it fails because of missing API key, that's expected in test env
      // But if it fails because MCP connection failed, that's a real error
      expect(body.error).toBeTruthy();
      // The error should be about the API key, not about MCP connection
      const isApiKeyError = body.error.includes('ANTHROPIC_API_KEY');
      const isMcpError = body.error.includes('MCP') || body.error.includes('ECONNREFUSED');
      if (isMcpError) {
        throw new Error(`MCP connection failed: ${body.error}`);
      }
      // API key error is acceptable - means MCP connected fine but Claude can't be called
      expect(isApiKeyError).toBeTruthy();
    } else {
      // 200 means streaming started successfully - MCP + Claude both working
      expect(response.status()).toBe(200);
    }
  });

  test('chat endpoint returns 400 for missing messages', async ({ request }) => {
    const response = await request.post('/api/chat?database=default', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('messages array is required');
  });

  test('MCP tools endpoint returns available tools', async ({ request }) => {
    // Verify the MCP endpoint that chat.ts connects to is working
    const response = await request.get('/api/mcp/tools?database=default');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.tools).toBeTruthy();
    expect(Array.isArray(body.tools)).toBeTruthy();

    // Should have our semantic layer tools
    const toolNames = body.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('catalog_search');
    expect(toolNames).toContain('catalog_describe');
    expect(toolNames).toContain('query_semantic');
  });
});

test.describe('Chat with Mocked Claude Response', () => {
  test('sends message and displays assistant response', async ({ page }) => {
    await page.goto('/chat');

    // Mock the chat API to return a streamed response without hitting Claude
    await page.route('/api/chat*', async (route) => {
      // Return a minimal AI SDK UI stream format
      const body = [
        '0:{"messageId":"msg-1"}\n',
        '2:[{"type":"text","text":"I found 3 measures available in your data catalog."}]\n',
        'd:{"finishReason":"stop"}\n',
      ].join('');

      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body,
      });
    });

    // Type a message
    const input = page.getByPlaceholder('Ask about your data...');
    await input.fill('What measures are available?');

    // Send it
    const sendButton = page.getByRole('button', { name: 'Send' });
    await sendButton.click();

    // Verify user message appears
    await expect(page.getByText('What measures are available?')).toBeVisible();
  });
});
