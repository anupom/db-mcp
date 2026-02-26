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

