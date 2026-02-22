import { clerkSetup, clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { test as setup, expect } from '@playwright/test';

setup.describe.configure({ mode: 'serial' });

setup('global setup', async ({}) => {
  await clerkSetup();

  if (!process.env.E2E_CLERK_USER_USERNAME) {
    throw new Error(
      'Missing E2E_CLERK_USER_USERNAME.\n' +
      'Create a test user in your Clerk dashboard and add credentials to .env'
    );
  }
});

const authFile = 'playwright/.clerk/user.json';

setup('authenticate', async ({ page }) => {
  // Set up testing token interceptor before navigating
  await setupClerkTestingToken({ page });

  // Listen for console messages for debugging
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('Clerk')) {
      console.log(`[browser ${msg.type()}] ${msg.text()}`);
    }
  });

  await page.goto('/');

  // Use emailAddress overload: creates sign-in token server-side via CLERK_SECRET_KEY,
  // then signs in via ticket strategy in the browser. This approach:
  // 1. Doesn't need a password
  // 2. Waits for window.Clerk.user !== null (verification that sign-in worked)
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
  });

  // Wait for authenticated app to render
  await expect(page.locator('text=DB-MCP Admin')).toBeVisible({ timeout: 30000 });

  await page.context().storageState({ path: authFile });
});
