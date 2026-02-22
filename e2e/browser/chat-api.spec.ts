import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect, waitForClerk, authenticatedFetch } from './fixtures';
import type { Page } from '@playwright/test';

let page: Page;
let defaultDbId: string;

test.describe('Chat API — MCP Integration', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'playwright/.clerk/user.json',
    });
    page = await context.newPage();
    await setupClerkTestingToken({ page });
    await waitForClerk(page);

    // Find the active default-* database for chat/mcp endpoints
    const list = await authenticatedFetch(page, '/api/databases');
    const defaultDb = list.body.databases.find(
      (d: { id: string; status: string }) => d.id.startsWith('default') && d.status === 'active'
    );
    defaultDbId = defaultDb?.id || 'default';
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('chat endpoint returns 400 for missing messages', async () => {
    const { status, body } = await authenticatedFetch(page, `/api/chat?database=${defaultDbId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(body.error).toBe('messages array is required');
  });

  test('MCP tools endpoint returns available tools', async () => {
    const { status, body } = await authenticatedFetch(page, `/api/mcp/tools?database=${defaultDbId}`);
    expect(status).toBe(200);
    expect(body.tools).toBeDefined();
    expect(Array.isArray(body.tools)).toBe(true);

    const toolNames = body.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('catalog_search');
    expect(toolNames).toContain('catalog_describe');
    expect(toolNames).toContain('query_semantic');
  });
});
