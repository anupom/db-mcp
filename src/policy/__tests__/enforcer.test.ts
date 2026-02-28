import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config.js', () => ({
  getConfig: () => ({
    MAX_LIMIT: 1000,
    DENY_MEMBERS: [],
    RETURN_SQL: false,
    DEFAULT_SEGMENTS: [],
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

import { PolicyEnforcer } from '../enforcer.js';
import type { CatalogIndex } from '../../catalog/index.js';
import type { IndexedMember } from '../../catalog/types.js';
import { DbMcpError } from '../../errors.js';

function makeMember(name: string, overrides: Partial<IndexedMember> = {}): IndexedMember {
  const cubeName = name.split('.')[0];
  return {
    name,
    type: 'measure',
    title: name,
    shortTitle: name.split('.')[1] ?? name,
    cubeName,
    memberType: 'number',
    isVisible: true,
    public: true,
    exposed: true,
    pii: false,
    ...overrides,
  };
}

function makeCatalog(members: IndexedMember[], opts: {
  defaultSegments?: string[];
  defaultFilters?: Array<{ member: string; operator: string; values?: string[] }>;
} = {}): CatalogIndex {
  const memberMap = new Map(members.map(m => [m.name, m]));
  return {
    isInitialized: () => true,
    initialize: vi.fn(),
    getMember: (name: string) => memberMap.get(name),
    getSuggestions: (query: string) => {
      return members
        .filter(m => m.name.includes(query.split('.').pop() ?? ''))
        .map(m => m.name)
        .slice(0, 3);
    },
    getDefaultSegments: () => opts.defaultSegments ?? [],
    getDefaultFilters: () => opts.defaultFilters ?? [],
  } as unknown as CatalogIndex;
}

describe('PolicyEnforcer', () => {
  describe('validate()', () => {
    it('rejects disallowed query keys', async () => {
      const catalog = makeCatalog([]);
      const enforcer = new PolicyEnforcer({}, catalog);

      await expect(
        enforcer.validate({ ungrouped: true, limit: 10 } as never)
      ).rejects.toThrow(DbMcpError);

      try {
        await enforcer.validate({ ungrouped: true, limit: 10 } as never);
      } catch (err) {
        expect((err as DbMcpError).code).toBe('QUERY_KEY_NOT_ALLOWED');
      }
    });

    it('rejects query without limit', async () => {
      const catalog = makeCatalog([]);
      const enforcer = new PolicyEnforcer({}, catalog);

      await expect(
        enforcer.validate({ measures: [] })
      ).rejects.toThrow(DbMcpError);

      try {
        await enforcer.validate({ measures: [] });
      } catch (err) {
        expect((err as DbMcpError).code).toBe('MISSING_LIMIT');
      }
    });

    it('rejects query where limit exceeds maxLimit', async () => {
      const catalog = makeCatalog([]);
      const enforcer = new PolicyEnforcer({ maxLimit: 100 }, catalog);

      await expect(
        enforcer.validate({ measures: [], limit: 200 })
      ).rejects.toThrow(DbMcpError);

      try {
        await enforcer.validate({ measures: [], limit: 200 });
      } catch (err) {
        expect((err as DbMcpError).code).toBe('LIMIT_TOO_HIGH');
      }
    });

    it('passes a valid query with measures, dimensions, filters, timeDimensions, segments', async () => {
      const members = [
        makeMember('Orders.count'),
        makeMember('Orders.status', { type: 'dimension', memberType: 'string' }),
        makeMember('Orders.createdAt', { type: 'timeDimension', memberType: 'time' }),
        makeMember('Orders.active', { type: 'segment', memberType: 'segment' }),
      ];
      const catalog = makeCatalog(members);
      const enforcer = new PolicyEnforcer({}, catalog);

      await expect(
        enforcer.validate({
          measures: ['Orders.count'],
          dimensions: ['Orders.status'],
          timeDimensions: [{ dimension: 'Orders.createdAt', granularity: 'day' }],
          filters: [{ member: 'Orders.status', operator: 'equals', values: ['active'] }],
          segments: ['Orders.active'],
          limit: 100,
        })
      ).resolves.toBeUndefined();
    });

    it('rejects unknown member', async () => {
      const catalog = makeCatalog([makeMember('Orders.count')]);
      const enforcer = new PolicyEnforcer({}, catalog);

      try {
        await enforcer.validate({
          measures: ['Orders.nonexistent'],
          limit: 10,
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as DbMcpError).code).toBe('UNKNOWN_MEMBER');
      }
    });

    it('rejects unexposed member', async () => {
      const catalog = makeCatalog([
        makeMember('Orders.secret', { exposed: false }),
      ]);
      const enforcer = new PolicyEnforcer({}, catalog);

      try {
        await enforcer.validate({
          measures: ['Orders.secret'],
          limit: 10,
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as DbMcpError).code).toBe('MEMBER_NOT_EXPOSED');
      }
    });

    it('rejects PII member', async () => {
      const catalog = makeCatalog([
        makeMember('Users.email', { pii: true }),
      ]);
      const enforcer = new PolicyEnforcer({}, catalog);

      try {
        await enforcer.validate({
          measures: ['Users.email'],
          limit: 10,
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as DbMcpError).code).toBe('PII_MEMBER_BLOCKED');
      }
    });

    it('rejects denied member from denyMembers config list', async () => {
      const catalog = makeCatalog([
        makeMember('Users.ssn'),
      ]);
      const enforcer = new PolicyEnforcer({
        denyMembers: ['Users.ssn'],
      }, catalog);

      try {
        await enforcer.validate({
          measures: ['Users.ssn'],
          limit: 10,
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as DbMcpError).code).toBe('PII_MEMBER_BLOCKED');
      }
    });

    it('rejects dimension not in allowedGroupBy for a measure', async () => {
      const catalog = makeCatalog([
        makeMember('Orders.revenue', {
          allowedGroupBy: ['Orders.region'],
        }),
        makeMember('Orders.status', { type: 'dimension', memberType: 'string' }),
        makeMember('Orders.region', { type: 'dimension', memberType: 'string' }),
      ]);
      const enforcer = new PolicyEnforcer({}, catalog);

      try {
        await enforcer.validate({
          measures: ['Orders.revenue'],
          dimensions: ['Orders.status'],
          limit: 10,
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as DbMcpError).code).toBe('GROUP_BY_NOT_ALLOWED');
      }
    });

    it('rejects dimension in deniedGroupBy for a measure', async () => {
      const catalog = makeCatalog([
        makeMember('Orders.revenue', {
          deniedGroupBy: ['Users.email'],
        }),
        makeMember('Users.email', { type: 'dimension', memberType: 'string' }),
      ]);
      const enforcer = new PolicyEnforcer({}, catalog);

      try {
        await enforcer.validate({
          measures: ['Orders.revenue'],
          dimensions: ['Users.email'],
          limit: 10,
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as DbMcpError).code).toBe('GROUP_BY_NOT_ALLOWED');
      }
    });

    it('allows dimension that IS in allowedGroupBy', async () => {
      const catalog = makeCatalog([
        makeMember('Orders.revenue', {
          allowedGroupBy: ['Orders.region'],
        }),
        makeMember('Orders.region', { type: 'dimension', memberType: 'string' }),
      ]);
      const enforcer = new PolicyEnforcer({}, catalog);

      await expect(
        enforcer.validate({
          measures: ['Orders.revenue'],
          dimensions: ['Orders.region'],
          limit: 10,
        })
      ).resolves.toBeUndefined();
    });

    it('handles filters with member field and dimension field (legacy)', async () => {
      const catalog = makeCatalog([
        makeMember('Orders.count'),
        makeMember('Orders.status', { type: 'dimension', memberType: 'string' }),
        makeMember('Orders.region', { type: 'dimension', memberType: 'string' }),
      ]);
      const enforcer = new PolicyEnforcer({}, catalog);

      // Both filter forms should work
      await expect(
        enforcer.validate({
          measures: ['Orders.count'],
          filters: [
            { member: 'Orders.status', operator: 'equals', values: ['active'] },
            { dimension: 'Orders.region', operator: 'equals', values: ['US'] },
          ],
          limit: 10,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('applyDefaults()', () => {
    it('merges default segments from config and catalog', async () => {
      const catalog = makeCatalog([], {
        defaultSegments: ['Orders.verified'],
      });
      const enforcer = new PolicyEnforcer({
        defaultSegments: ['Orders.confirmed'],
      }, catalog);

      const result = await enforcer.applyDefaults({ measures: ['Orders.count'], limit: 10 });

      expect(result.normalizedQuery.segments).toContain('Orders.confirmed');
      expect(result.normalizedQuery.segments).toContain('Orders.verified');
      expect(result.notes.length).toBeGreaterThan(0);
      expect(result.notes[0]).toContain('default segments');
    });

    it('deduplicates segments already in the query', async () => {
      const catalog = makeCatalog([], {
        defaultSegments: ['Orders.active'],
      });
      const enforcer = new PolicyEnforcer({
        defaultSegments: ['Orders.confirmed'],
      }, catalog);

      const result = await enforcer.applyDefaults({
        measures: ['Orders.count'],
        segments: ['Orders.active'],
        limit: 10,
      });

      // Orders.active was already in the query, so only Orders.confirmed should be added
      expect(result.normalizedQuery.segments!.filter(s => s === 'Orders.active')).toHaveLength(1);
      expect(result.normalizedQuery.segments).toContain('Orders.confirmed');
    });

    it('merges default filters from config and catalog (deduplicates by member)', async () => {
      const catalog = makeCatalog([], {
        defaultFilters: [
          { member: 'Orders.status', operator: 'equals', values: ['active'] },
          { member: 'Orders.region', operator: 'equals', values: ['US'] },
        ],
      });
      const enforcer = new PolicyEnforcer({
        defaultFilters: [
          { member: 'Orders.status', operator: 'notEquals', values: ['deleted'] },
          { member: 'Orders.type', operator: 'equals', values: ['retail'] },
        ],
      }, catalog);

      const result = await enforcer.applyDefaults({ measures: ['Orders.count'], limit: 10 });

      const filterMembers = result.normalizedQuery.filters!.map(f => f.member);
      expect(filterMembers).toContain('Orders.status');
      expect(filterMembers).toContain('Orders.type');
      expect(filterMembers).toContain('Orders.region');
      expect(result.notes.length).toBeGreaterThan(0);
      expect(result.notes.some(n => n.includes('default filters'))).toBe(true);
    });

    it('returns notes describing what was applied', async () => {
      const catalog = makeCatalog([], {
        defaultSegments: ['Orders.active'],
      });
      const enforcer = new PolicyEnforcer({}, catalog);

      const result = await enforcer.applyDefaults({ measures: ['Orders.count'], limit: 10 });

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]).toContain('Orders.active');
    });

    it('no-ops when no defaults configured', async () => {
      const catalog = makeCatalog([]);
      const enforcer = new PolicyEnforcer({}, catalog);

      const query = { measures: ['Orders.count'], limit: 10 };
      const result = await enforcer.applyDefaults(query);

      expect(result.normalizedQuery).toEqual(query);
      expect(result.notes).toHaveLength(0);
    });
  });

  describe('shouldReturnSql()', () => {
    it('returns config value', () => {
      const catalog = makeCatalog([]);

      const enforcerFalse = new PolicyEnforcer({ returnSql: false }, catalog);
      expect(enforcerFalse.shouldReturnSql()).toBe(false);

      const enforcerTrue = new PolicyEnforcer({ returnSql: true }, catalog);
      expect(enforcerTrue.shouldReturnSql()).toBe(true);
    });
  });
});
