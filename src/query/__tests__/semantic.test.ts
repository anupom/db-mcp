import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config.js', () => ({
  getConfig: () => ({
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
  return {
    getLogger: () => noopLogger,
    auditLog: vi.fn(),
  };
});

import { QuerySemantic } from '../semantic.js';
import { auditLog } from '../../utils/logger.js';
import type { CubeClient } from '../../cube/client.js';
import type { PolicyEnforcer } from '../../policy/enforcer.js';
import type { CubeLoadResponse, CubeSqlResponse } from '../../cube/types.js';
import type { CubeQuery } from '../../types.js';
import { DbMcpError } from '../../errors.js';

const mockAuditLog = vi.mocked(auditLog);

function makeLoadResponse(overrides?: Partial<CubeLoadResponse>): CubeLoadResponse {
  return {
    query: { measures: ['Orders.count'], limit: 10 },
    data: [{ 'Orders.count': 42 }],
    lastRefreshTime: '2025-01-01T00:00:00Z',
    annotation: {
      measures: {
        'Orders.count': { title: 'Orders Count', shortTitle: 'Count', type: 'number' },
      },
      dimensions: {},
      segments: {},
      timeDimensions: {},
    },
    dataSource: 'default',
    dbType: 'postgres',
    extDbType: 'postgres',
    external: false,
    slowQuery: false,
    total: null,
    ...overrides,
  };
}

function makeSqlResponse(): CubeSqlResponse {
  return {
    sql: {
      sql: ['SELECT COUNT(*) FROM orders'],
      params: [],
    },
  };
}

function makeCubeClient(opts?: {
  loadResponse?: CubeLoadResponse;
  sqlResponse?: CubeSqlResponse;
  sqlError?: Error;
}): CubeClient {
  return {
    load: vi.fn().mockResolvedValue(opts?.loadResponse ?? makeLoadResponse()),
    getSql: opts?.sqlError
      ? vi.fn().mockRejectedValue(opts.sqlError)
      : vi.fn().mockResolvedValue(opts?.sqlResponse ?? makeSqlResponse()),
  } as unknown as CubeClient;
}

function makePolicyEnforcer(opts?: {
  validateError?: Error;
  returnSql?: boolean;
  defaultNotes?: string[];
  defaultSegments?: string[];
}): PolicyEnforcer {
  return {
    validate: opts?.validateError
      ? vi.fn().mockRejectedValue(opts.validateError)
      : vi.fn().mockResolvedValue(undefined),
    applyDefaults: vi.fn().mockImplementation((query: CubeQuery) => ({
      originalQuery: query,
      normalizedQuery: {
        ...query,
        ...(opts?.defaultSegments ? { segments: [...(query.segments ?? []), ...opts.defaultSegments] } : {}),
      },
      notes: opts?.defaultNotes ?? [],
    })),
    shouldReturnSql: vi.fn().mockReturnValue(opts?.returnSql ?? false),
  } as unknown as PolicyEnforcer;
}

const baseQuery: CubeQuery = {
  measures: ['Orders.count'],
  limit: 10,
};

describe('QuerySemantic', () => {
  beforeEach(() => {
    mockAuditLog.mockClear();
  });

  describe('execute()', () => {
    it('happy path: validates → applies defaults → loads → returns result', async () => {
      const client = makeCubeClient();
      const enforcer = makePolicyEnforcer();
      const qs = new QuerySemantic({}, client, enforcer);

      const result = await qs.execute(baseQuery);

      expect(enforcer.validate).toHaveBeenCalledWith(baseQuery);
      expect(enforcer.applyDefaults).toHaveBeenCalledWith(baseQuery);
      expect(client.load).toHaveBeenCalled();
      expect(result.data).toEqual([{ 'Orders.count': 42 }]);
      expect(result.schema).toBeDefined();
      expect(result.lineage).toBeDefined();
      expect(result.debug.query_hash).toBeDefined();
    });

    it('includes SQL when shouldReturnSql() returns true', async () => {
      const client = makeCubeClient();
      const enforcer = makePolicyEnforcer({ returnSql: true });
      const qs = new QuerySemantic({}, client, enforcer);

      const result = await qs.execute(baseQuery);

      expect(client.getSql).toHaveBeenCalled();
      expect(result.debug.sql).toBe('SELECT COUNT(*) FROM orders');
    });

    it('SQL fetch failure is graceful (warns, does not throw)', async () => {
      const client = makeCubeClient({ sqlError: new Error('SQL unavailable') });
      const enforcer = makePolicyEnforcer({ returnSql: true });
      const qs = new QuerySemantic({}, client, enforcer);

      const result = await qs.execute(baseQuery);

      expect(result.debug.sql).toBeNull();
      expect(result.data).toBeDefined();
    });

    it('policy validation failure throws and audit-logs error', async () => {
      const validationError = new DbMcpError({
        code: 'MISSING_LIMIT',
        message: 'Query must include a limit',
      });
      const client = makeCubeClient();
      const enforcer = makePolicyEnforcer({ validateError: validationError });
      const qs = new QuerySemantic({}, client, enforcer);

      await expect(qs.execute(baseQuery)).rejects.toThrow(DbMcpError);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'query.execute',
          result: 'error',
          error: expect.objectContaining({
            code: 'MISSING_LIMIT',
          }),
        })
      );
    });

    it('builds schema from response annotations', async () => {
      const response = makeLoadResponse({
        annotation: {
          measures: {
            'Orders.count': { title: 'Count', shortTitle: 'Count', type: 'number' },
          },
          dimensions: {
            'Orders.status': { title: 'Status', shortTitle: 'Status', type: 'string' },
          },
          segments: {},
          timeDimensions: {
            'Orders.createdAt': { title: 'Created At', shortTitle: 'Created', type: 'time' },
          },
        },
      });
      const client = makeCubeClient({ loadResponse: response });
      const enforcer = makePolicyEnforcer();
      const qs = new QuerySemantic({}, client, enforcer);

      const result = await qs.execute(baseQuery);

      expect(result.schema).toHaveLength(3);
      const keys = result.schema.map(s => s.key);
      expect(keys).toContain('Orders.count');
      expect(keys).toContain('Orders.status');
      expect(keys).toContain('Orders.createdAt');
    });

    it('extracts and deduplicates members for lineage', async () => {
      const query: CubeQuery = {
        measures: ['Orders.count'],
        dimensions: ['Orders.status'],
        filters: [{ member: 'Orders.status', operator: 'equals', values: ['active'] }],
        limit: 10,
      };
      const client = makeCubeClient();
      const enforcer = makePolicyEnforcer();
      const qs = new QuerySemantic({}, client, enforcer);

      const result = await qs.execute(query);

      // Orders.status appears in both dimensions and filters but should be deduplicated
      const statusCount = result.lineage.members.filter(m => m === 'Orders.status').length;
      expect(statusCount).toBe(1);
      expect(result.lineage.cubes).toContain('Orders');
    });

    it('includes notes from applyDefaults in result', async () => {
      const client = makeCubeClient();
      const enforcer = makePolicyEnforcer({
        defaultNotes: ['Applied default segments: Orders.active'],
      });
      const qs = new QuerySemantic({}, client, enforcer);

      const result = await qs.execute(baseQuery);

      expect(result.notes).toContain('Applied default segments: Orders.active');
    });

    it('computeQueryHash is deterministic', async () => {
      const client = makeCubeClient();
      const enforcer = makePolicyEnforcer();
      const qs = new QuerySemantic({}, client, enforcer);

      const result1 = await qs.execute(baseQuery);
      const result2 = await qs.execute(baseQuery);

      expect(result1.debug.query_hash).toBe(result2.debug.query_hash);
      expect(result1.debug.query_hash).toHaveLength(16);
    });

    it('audit logs success with row_count and duration', async () => {
      const client = makeCubeClient();
      const enforcer = makePolicyEnforcer();
      const qs = new QuerySemantic({}, client, enforcer);

      await qs.execute(baseQuery);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'query.execute',
          result: 'success',
          row_count: 1,
          duration_ms: expect.any(Number),
          query_hash: expect.any(String),
        })
      );
    });

    it('audit logs error with error code', async () => {
      const error = new DbMcpError({
        code: 'PII_MEMBER_BLOCKED',
        message: 'PII member blocked: Users.email',
      });
      const client = makeCubeClient();
      const enforcer = makePolicyEnforcer({ validateError: error });
      const qs = new QuerySemantic({}, client, enforcer);

      await expect(qs.execute(baseQuery)).rejects.toThrow();

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'error',
          error: expect.objectContaining({
            code: 'PII_MEMBER_BLOCKED',
          }),
        })
      );
    });
  });
});
