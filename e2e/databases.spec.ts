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

describe('Databases API', () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerRunning();
  });

  it('GET /api/databases returns list', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/databases`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.databases)).toBe(true);
  });

  it('POST /api/databases validates input', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/databases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'bad id with spaces' }),
    });
    expect(response.status).toBe(400);
  });

  it('GET /api/databases/:id returns 404 for unknown id', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/databases/nonexistent-db-id`);
    expect(response.status).toBe(404);
  });

  it('CRUD lifecycle for a test database', async ({ skip }) => {
    if (!serverUp) skip();

    const testId = `test-e2e-${Date.now()}`;

    // Create
    const createRes = await fetch(`${BASE_URL}/api/databases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testId,
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
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.database.id).toBe(testId);
    expect(created.database.name).toBe('E2E Test DB');
    expect(created.database.status).toBe('inactive');

    // Read
    const getRes = await fetch(`${BASE_URL}/api/databases/${testId}`);
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.database.id).toBe(testId);
    expect(fetched.database.connection.password).toBe('********');

    // Update
    const updateRes = await fetch(`${BASE_URL}/api/databases/${testId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated E2E DB' }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.database.name).toBe('Updated E2E DB');

    // List includes it
    const listRes = await fetch(`${BASE_URL}/api/databases`);
    const list = await listRes.json();
    expect(list.databases.some((d: { id: string }) => d.id === testId)).toBe(true);

    // Delete
    const deleteRes = await fetch(`${BASE_URL}/api/databases/${testId}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);

    // Verify gone
    const verifyRes = await fetch(`${BASE_URL}/api/databases/${testId}`);
    expect(verifyRes.status).toBe(404);
  });

  it('cannot delete an active database', async ({ skip }) => {
    if (!serverUp) skip();

    const listRes = await fetch(`${BASE_URL}/api/databases`);
    const list = await listRes.json();
    const activeDb = list.databases.find((d: { status: string }) => d.status === 'active');

    if (activeDb) {
      const deleteRes = await fetch(`${BASE_URL}/api/databases/${activeDb.id}`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(400);
      const body = await deleteRes.json();
      expect(body.error).toContain('active');
    }
  });
});
