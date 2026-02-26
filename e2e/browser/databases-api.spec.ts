import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect, waitForClerk, authenticatedFetch } from './fixtures';
import type { Page } from '@playwright/test';

let page: Page;

test.describe('Databases API', () => {
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

  test('GET /api/databases returns list', async () => {
    const { status, body } = await authenticatedFetch(page, '/api/databases');
    expect(status).toBe(200);
    expect(Array.isArray(body.databases)).toBe(true);
  });

  test('POST /api/databases validates input', async () => {
    const { status } = await authenticatedFetch(page, '/api/databases', {
      method: 'POST',
      body: JSON.stringify({ id: 'bad id with spaces' }),
    });
    expect(status).toBe(400);
  });

  test('GET /api/databases/:id returns 404 for unknown id', async () => {
    const { status } = await authenticatedFetch(page, '/api/databases/nonexistent-db-id');
    expect(status).toBe(404);
  });

  test('CRUD lifecycle for a test database', async () => {
    const testSlug = `test-e2e-${Date.now()}`;

    // Create — the returned id may be tenant-scoped (slug + hash) in SaaS mode
    const create = await authenticatedFetch(page, '/api/databases', {
      method: 'POST',
      body: JSON.stringify({
        id: testSlug,
        name: 'E2E Test DB',
        description: 'Created by e2e test',
        connection: {
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          database: 'testdb',
          user: 'testuser',
          password: 'testpass',
        },
      }),
    });
    expect(create.status).toBe(201);
    const dbId = create.body.database.id;
    expect(dbId).toContain(testSlug);
    expect(create.body.database.name).toBe('E2E Test DB');
    expect(create.body.database.status).toBe('inactive');

    // Read — password should be masked
    const get = await authenticatedFetch(page, `/api/databases/${dbId}`);
    expect(get.status).toBe(200);
    expect(get.body.database.id).toBe(dbId);
    expect(get.body.database.connection.password).toBe('********');

    // Update
    const update = await authenticatedFetch(page, `/api/databases/${dbId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated E2E DB' }),
    });
    expect(update.status).toBe(200);
    expect(update.body.database.name).toBe('Updated E2E DB');

    // List includes it
    const list = await authenticatedFetch(page, '/api/databases');
    expect(list.body.databases.some((d: { id: string }) => d.id === dbId)).toBe(true);

    // Delete
    const del = await authenticatedFetch(page, `/api/databases/${dbId}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);

    // Verify gone
    const verify = await authenticatedFetch(page, `/api/databases/${dbId}`);
    expect(verify.status).toBe(404);
  });

  test('cannot delete an active database', async () => {
    const list = await authenticatedFetch(page, '/api/databases');
    const activeDb = list.body.databases.find((d: { status: string }) => d.status === 'active');

    if (!activeDb) {
      test.skip();
      return;
    }

    const del = await authenticatedFetch(page, `/api/databases/${activeDb.id}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(400);
    expect(del.body.error).toContain('active');
  });
});
