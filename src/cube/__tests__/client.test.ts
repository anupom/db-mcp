import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config.js', () => ({
  getConfig: () => ({
    CUBE_API_URL: 'http://localhost:4000/cubejs-api/v1',
    CUBE_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    CUBE_JWT_EXPIRES_IN: '1h',
    LOG_LEVEL: 'silent',
  }),
}));

vi.mock('../../utils/logger.js', () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: () => noopLogger,
  };
  return { getLogger: () => noopLogger };
});

vi.mock('../../utils/jwt.js', () => ({
  generateCubeJwt: vi.fn().mockReturnValue('mock-jwt-token'),
}));

import { CubeClient } from '../client.js';
import { generateCubeJwt } from '../../utils/jwt.js';
import { DbMcpError } from '../../errors.js';

const mockFetch = vi.fn();

describe('CubeClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    vi.mocked(generateCubeJwt).mockReturnValue('mock-jwt-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getMeta()', () => {
    it('calls GET /meta with JWT auth header', async () => {
      const metaResponse = { cubes: [] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(metaResponse),
      });

      const client = new CubeClient();
      const result = await client.getMeta();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4000/cubejs-api/v1/meta');
      expect(opts.headers.Authorization).toBe('Bearer mock-jwt-token');
      expect(result).toEqual(metaResponse);
    });
  });

  describe('load()', () => {
    it('calls GET /load?query=... with JSON-encoded query', async () => {
      const loadResponse = {
        query: {},
        data: [{ count: 1 }],
        annotation: { measures: {}, dimensions: {}, segments: {}, timeDimensions: {} },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(loadResponse),
      });

      const client = new CubeClient();
      const query = { measures: ['Orders.count'], limit: 10 };
      const result = await client.load(query);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/load?');
      expect(url).toContain('query=');
      // Verify the query is JSON-encoded in the URL
      const urlObj = new URL(url);
      const queryParam = urlObj.searchParams.get('query');
      expect(JSON.parse(queryParam!)).toEqual(query);
      expect(result).toEqual(loadResponse);
    });
  });

  describe('getSql()', () => {
    it('calls GET /sql?query=... with JSON-encoded query', async () => {
      const sqlResponse = { sql: { sql: ['SELECT 1'], params: [] } };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sqlResponse),
      });

      const client = new CubeClient();
      const query = { measures: ['Orders.count'], limit: 10 };
      const result = await client.getSql(query);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/sql?');
      const urlObj = new URL(url);
      const queryParam = urlObj.searchParams.get('query');
      expect(JSON.parse(queryParam!)).toEqual(query);
      expect(result).toEqual(sqlResponse);
    });
  });

  describe('error handling', () => {
    it('HTTP error response throws cubeError with error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid query' }),
      });

      const client = new CubeClient();

      try {
        await client.getMeta();
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DbMcpError);
        expect((err as DbMcpError).code).toBe('CUBE_ERROR');
        expect((err as DbMcpError).message).toContain('Invalid query');
      }
    });
  });

  describe('JWT configuration', () => {
    it('JWT includes databaseId in payload when configured', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cubes: [] }),
      });

      const client = new CubeClient({ databaseId: 'db-123' });
      await client.getMeta();

      expect(generateCubeJwt).toHaveBeenCalledWith(
        { databaseId: 'db-123' },
        expect.any(String),
        expect.any(String)
      );
    });

    it('JWT has empty payload when no databaseId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cubes: [] }),
      });

      const client = new CubeClient();
      await client.getMeta();

      expect(generateCubeJwt).toHaveBeenCalledWith(
        {},
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('constructor', () => {
    it('falls back to global config when no config provided', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cubes: [] }),
      });

      const client = new CubeClient();
      // Client should be created successfully using defaults from getConfig()
      expect(client).toBeDefined();
    });

    it('uses provided config values over globals', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cubes: [] }),
      });

      const client = new CubeClient({
        baseUrl: 'http://custom:9999/cubejs-api/v1',
        jwtSecret: 'custom-secret-that-is-at-least-32-characters',
        jwtExpiresIn: '2h',
      });
      await client.getMeta();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('http://custom:9999/cubejs-api/v1/meta');

      expect(generateCubeJwt).toHaveBeenCalledWith(
        {},
        'custom-secret-that-is-at-least-32-characters',
        '2h'
      );
    });
  });

  describe('healthCheck()', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cubes: [] }),
      });

      const client = new CubeClient();
      const result = await client.healthCheck();
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const client = new CubeClient();
      const result = await client.healthCheck();
      expect(result).toBe(false);
    });
  });
});
