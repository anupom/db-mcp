import { test, expect, navigateToSuccessScreen } from './fixtures';

test.describe('Welcome Screen', () => {
  test('shows welcome screen when no databases exist', async ({ page, backendUrl }) => {
    // Intercept to return empty databases list
    await page.route('**/api/databases', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ databases: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await expect(page.getByText('Welcome to DB-MCP')).toBeVisible();
    await expect(page.getByText('Try with Demo Data')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect Your Database' })).toBeVisible();
  });
});

test.describe('Success Screen', () => {
  test.beforeEach(async ({ page, backendUrl }) => {
    await navigateToSuccessScreen(page);
  });

  test('init flow triggers and shows success screen', async ({ page }) => {
    await expect(page.getByText("You're all set!")).toBeVisible();
    await expect(page.getByText('demo e-commerce database is ready')).toBeVisible();
  });

  test('Step 1 — Database Connected shows PostgreSQL and Active', async ({ page }) => {
    await expect(page.getByText('Database Connected')).toBeVisible();
    await expect(page.getByText('PostgreSQL')).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
  });

  test('Step 2 — Cubes Ready shows cube info and link', async ({ page }) => {
    await expect(page.getByText('Cubes Ready')).toBeVisible();
    // Should show loaded cubes (real backend data)
    await expect(page.getByText(/cubes loaded|Cubes loaded from demo data/)).toBeVisible();
    // Step 2 has an "Explore tables" link
    const step2 = page.locator('text=Cubes Ready').locator('..').locator('..');
    const exploreLink = step2.getByRole('link', { name: /Explore tables/ });
    await expect(exploreLink).toBeVisible();
    await expect(exploreLink).toHaveAttribute('href', '/tables');
  });

  test('Step 3 — MCP Endpoint Ready shows URL and config', async ({ page }) => {
    await expect(page.getByText('MCP Endpoint Ready')).toBeVisible();
    // URL may include tenant slug (e.g. /mcp/org-xxx/default) or just /mcp/default
    await expect(page.locator('code', { hasText: /\/mcp\/.*default/ })).toBeVisible();
    await expect(page.locator('pre', { hasText: '"mcpServers"' })).toBeVisible();
    await expect(page.locator('pre', { hasText: '"db-mcp"' })).toBeVisible();
  });

  test('Next Steps links have correct hrefs', async ({ page }) => {
    const nextSteps = page.locator('text=Next Steps').locator('..');

    const links = [
      { name: /Explore tables/, href: '/tables' },
      { name: /governance/, href: '/governance' },
      { name: /AI chat/, href: '/chat' },
      { name: /MCP tools/, href: '/mcp' },
    ];

    for (const { name, href } of links) {
      const link = nextSteps.getByRole('link', { name });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', href);
    }
  });

  test('Continue to Dashboard navigates to database list', async ({ page }) => {
    await page.getByRole('button', { name: /Continue to Dashboard/ }).click();
    await expect(page.locator('h1', { hasText: 'Databases' })).toBeVisible();
    await expect(page.getByText('Default Database', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Auth-aware UI', () => {
  test('shows API key notice with link', async ({ page, backendUrl }) => {
    await navigateToSuccessScreen(page);

    // Auth is enabled (real Clerk session) — amber notice should be visible
    const authNotice = page.locator('.bg-amber-50');
    await expect(authNotice).toBeVisible();
    await expect(authNotice.getByText('API key')).toBeVisible();
    await expect(authNotice.getByRole('link', { name: 'API Keys' })).toHaveAttribute('href', '/api-keys');
    // Config should show the auth header placeholder
    await expect(page.locator('pre', { hasText: '<your-api-key>' })).toBeVisible();
  });
});
