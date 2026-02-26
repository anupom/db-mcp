import { test, expect } from './fixtures';

test.describe('Databases Page', () => {
  test('shows setting up screen when no databases exist', async ({ page, backendUrl }) => {
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
    await expect(page.getByText('Setting up your workspace...')).toBeVisible();
    await expect(page.getByRole('button', { name: /Refresh/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Connect Your Database/ })).toBeVisible();
  });

  test('shows database list when databases exist', async ({ page, backendUrl }) => {
    await page.goto('/');
    // Wait for the page to load — should show the database list (default DB is auto-created)
    await expect(page.locator('h1', { hasText: 'Databases' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Sample Database', { exact: true }).first()).toBeVisible();
  });

  test('no welcome screen or success screen elements', async ({ page, backendUrl }) => {
    await page.goto('/');
    await expect(page.locator('h1', { hasText: 'Databases' })).toBeVisible({ timeout: 15000 });
    // These old UI elements should not exist
    await expect(page.getByText('Welcome to DB-MCP')).not.toBeVisible();
    await expect(page.getByText('Try with Demo Data')).not.toBeVisible();
    await expect(page.getByText("You're all set!")).not.toBeVisible();
  });
});
