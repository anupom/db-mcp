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

describe('Auth — self-hosted mode (no Clerk vars)', () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerRunning();
  });

  it('GET /api/config returns authEnabled: false', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/config`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.authEnabled).toBe(false);
    expect(body.clerkPublishableKey).toBeNull();
  });

  it('API keys endpoint returns 404 in self-hosted mode', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/api-keys`);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toContain('not available in self-hosted mode');
  });

  it('admin API routes work without auth headers', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/databases`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.databases).toBeDefined();
    expect(Array.isArray(body.databases)).toBe(true);
  });

  it('MCP tools endpoint works without auth', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api/mcp/tools`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.tools).toBeDefined();
    const toolNames = body.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('catalog_search');
    expect(toolNames).toContain('catalog_describe');
    expect(toolNames).toContain('query_semantic');
  });
});

describe('Auth — API discovery', () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await isServerRunning();
  });

  it('GET /api returns endpoint listing with api-keys and config', async ({ skip }) => {
    if (!serverUp) skip();

    const response = await fetch(`${BASE_URL}/api`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe('DB-MCP Admin API');
    expect(body.endpoints.apiKeys).toBe('/api/api-keys');
    expect(body.endpoints.config).toBe('/api/config');
  });
});
