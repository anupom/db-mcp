import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test as base, type Page } from '@playwright/test';

const BACKEND_URL = process.env.TEST_BACKEND_URL || 'http://localhost:3000';

/**
 * Custom test fixture that checks backend health before running tests.
 * Sets up the Clerk testing token interceptor so auth works in all tests.
 */
export const test = base.extend<{ backendUrl: string }>({
  backendUrl: async ({}, use) => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
      // Accept 503 — just means no default DB yet, server is still running
      if (res.status >= 500 && res.status !== 503) throw new Error(`Health check returned ${res.status}`);
    } catch (err) {
      throw new Error(
        `Backend not reachable at ${BACKEND_URL}. Start services first:\n` +
        `  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres cube\n` +
        `  npm run dev &\n` +
        `  cd admin/frontend && npm run dev &\n\n` +
        `Original error: ${err instanceof Error ? err.message : err}`
      );
    }
    await use(BACKEND_URL);
  },
});

export { expect } from '@playwright/test';

/**
 * Wait for Clerk to be loaded and session available.
 */
export async function waitForClerk(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).Clerk?.session, { timeout: 15000 });
}

/**
 * Run an authenticated fetch() inside the browser context using the Clerk session token.
 */
export async function authenticatedFetch(
  page: Page,
  path: string,
  options?: { method?: string; body?: string; headers?: Record<string, string> }
): Promise<{ status: number; body: any }> {
  return page.evaluate(async ({ path, options }) => {
    const token = await (window as any).Clerk.session.getToken();
    const res = await fetch(path, {
      method: options?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
      body: options?.body,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }, { path, options });
}

/**
 * Navigate through the "Try with Demo Data" flow to the success screen.
 *
 * Intercepts GET /api/databases to return an empty list so the welcome screen
 * shows even if the default database already exists. After the init POST
 * completes, the intercept is removed so real data flows back.
 *
 * Everything else (auth, POST init, GET cubes) is real E2E.
 */
export async function navigateToSuccessScreen(page: Page): Promise<void> {
  let initCalled = false;

  // Ensure Clerk testing token is active in this browser context
  await setupClerkTestingToken({ page });

  // Clean up any existing default databases from prior test runs.
  // Navigate first so Clerk SDK loads with auth from storageState,
  // then use window.Clerk.session.getToken() for authenticated API calls.
  await page.goto('/');
  await page.waitForFunction(() => (window as any).Clerk?.session, { timeout: 15000 });
  const defaultDbs: string[] = await page.evaluate(async () => {
    const token = await (window as any).Clerk.session.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const res = await fetch('/api/databases', { headers });
    if (!res.ok) return [];
    const { databases } = await res.json();
    return (databases || [])
      .filter((db: { id: string }) => db.id.startsWith('default'))
      .map((db: { id: string }) => db.id);
  });
  for (const dbId of defaultDbs) {
    await page.evaluate(async (id) => {
      const token = await (window as any).Clerk.session.getToken();
      await fetch(`/api/databases/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }, dbId);
  }

  // Intercept GET /api/databases to simulate fresh install (welcome screen).
  // Only intercepts the exact path, not sub-paths like /initialize-default.
  await page.route('**/api/databases', async (route) => {
    const url = new URL(route.request().url());
    const isExactPath = url.pathname === '/api/databases';

    if (route.request().method() === 'GET' && isExactPath && !initCalled) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ databases: [] }),
      });
    } else {
      await route.continue();
    }
  });

  // Detect when init POST completes so we stop faking empty databases
  page.on('response', (response) => {
    if (response.url().includes('/databases/initialize-default') && response.ok()) {
      initCalled = true;
    }
  });

  await page.goto('/');
  await page.getByText('Welcome to DB-MCP').waitFor();
  await page.getByText('Try with Demo Data').click();
  await page.getByText("You're all set!").waitFor({ timeout: 30000 });
}
