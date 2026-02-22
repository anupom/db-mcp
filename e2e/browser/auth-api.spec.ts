import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect, waitForClerk, authenticatedFetch } from './fixtures';
import type { Page } from '@playwright/test';

let page: Page;

test.describe('Auth — Clerk-enabled mode', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'playwright/.clerk/user.json',
    });
    page = await context.newPage();
    await setupClerkTestingToken({ page });
    await waitForClerk(page);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('GET /api/config returns authEnabled: true', async () => {
    // Public endpoint — no auth needed
    const { status, body } = await page.evaluate(async () => {
      const res = await fetch('/api/config');
      const body = await res.json();
      return { status: res.status, body };
    });
    expect(status).toBe(200);
    expect(body.authEnabled).toBe(true);
    expect(body.clerkPublishableKey).toBeTruthy();
  });

  test('API keys endpoint accessible with auth', async () => {
    const { status, body } = await authenticatedFetch(page, '/api/api-keys');
    expect(status).toBe(200);
    expect(body.keys).toBeDefined();
    expect(Array.isArray(body.keys)).toBe(true);
  });

  test('unauthenticated requests get 401', async ({ browser, backendUrl }) => {
    // Use a fresh context WITHOUT Clerk storageState so no session cookie is sent
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    try {
      await freshPage.goto('/');
      const { status } = await freshPage.evaluate(async (base) => {
        const res = await fetch(`${base}/api/databases`);
        return { status: res.status };
      }, backendUrl);
      expect(status).toBe(401);
    } finally {
      await freshContext.close();
    }
  });

  test('GET /api returns endpoint listing with tenant', async () => {
    // Public endpoint — no auth needed
    const { status, body } = await page.evaluate(async () => {
      const res = await fetch('/api');
      const body = await res.json();
      return { status: res.status, body };
    });
    expect(status).toBe(200);
    expect(body.name).toBe('DB-MCP Admin API');
    expect(body.endpoints.apiKeys).toBe('/api/api-keys');
    expect(body.endpoints.config).toBe('/api/config');
    expect(body.endpoints.tenant).toBe('/api/tenant');
  });

  test('GET /api/tenant returns tenant info with auto-generated slug', async () => {
    const { status, body } = await authenticatedFetch(page, '/api/tenant');
    expect(status).toBe(200);
    expect(body.tenantId).toBeTruthy();
    expect(body.slug).toBeTruthy();
    expect(body.slug).toMatch(/^[a-z][a-z0-9-]+$/);
  });
});
