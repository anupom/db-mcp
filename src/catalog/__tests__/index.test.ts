import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config.js', () => ({
  getConfig: () => ({
    DEFAULT_SEGMENTS: ['Global.defaultSeg'],
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

import { CatalogIndex } from '../index.js';
import type { CubeClient } from '../../cube/client.js';
import type { CubeMetaResponse } from '../../cube/types.js';
import { DbMcpError } from '../../errors.js';

function makeMeta(overrides?: Partial<CubeMetaResponse>): CubeMetaResponse {
  return {
    cubes: [
      {
        name: 'Orders',
        title: 'Orders',
        measures: [
          {
            name: 'Orders.count',
            title: 'Orders Count',
            shortTitle: 'Count',
            description: 'Total number of orders',
            type: 'number',
            aggType: 'count',
            drillMembers: ['Orders.id', 'Orders.status'],
            isVisible: true,
            public: true,
          },
          {
            name: 'Orders.revenue',
            title: 'Orders Revenue',
            shortTitle: 'Revenue',
            description: 'Total revenue from orders',
            type: 'number',
            aggType: 'sum',
            isVisible: true,
            public: true,
          },
        ],
        dimensions: [
          {
            name: 'Orders.id',
            title: 'Orders Id',
            shortTitle: 'Id',
            type: 'number',
            primaryKey: true,
            isVisible: false,
            public: true,
          },
          {
            name: 'Orders.status',
            title: 'Orders Status',
            shortTitle: 'Status',
            description: 'Order status',
            type: 'string',
            isVisible: true,
            public: true,
          },
          {
            name: 'Orders.createdAt',
            title: 'Orders Created At',
            shortTitle: 'Created At',
            description: 'When the order was created',
            type: 'time',
            isVisible: true,
            public: true,
          },
        ],
        segments: [
          {
            name: 'Orders.active',
            title: 'Active Orders',
            shortTitle: 'Active',
            description: 'Only active orders',
            isVisible: true,
            public: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeCubeClient(meta?: CubeMetaResponse): CubeClient {
  return {
    getMeta: vi.fn().mockResolvedValue(meta ?? makeMeta()),
  } as unknown as CubeClient;
}

describe('CatalogIndex', () => {
  describe('initialize() & buildIndex()', () => {
    it('indexes measures, dimensions, segments from Cube metadata', async () => {
      const client = makeCubeClient();
      const catalog = new CatalogIndex({}, client);

      await catalog.initialize();

      expect(catalog.getMember('Orders.count')).toBeDefined();
      expect(catalog.getMember('Orders.revenue')).toBeDefined();
      expect(catalog.getMember('Orders.status')).toBeDefined();
      expect(catalog.getMember('Orders.createdAt')).toBeDefined();
      expect(catalog.getMember('Orders.active')).toBeDefined();
    });

    it('maps time dimensions to timeDimension type', async () => {
      const client = makeCubeClient();
      const catalog = new CatalogIndex({}, client);
      await catalog.initialize();

      const timeDim = catalog.getMember('Orders.createdAt');
      expect(timeDim).toBeDefined();
      expect(timeDim!.type).toBe('timeDimension');
    });

    it('applies catalog overrides (exposed, pii, description, allowedGroupBy)', async () => {
      const client = makeCubeClient();
      const catalog = new CatalogIndex({
        catalogConfig: {
          version: '1.0',
          members: {
            'Orders.status': {
              exposed: false,
              pii: true,
              description: 'Overridden description',
              allowedGroupBy: ['Orders.region'],
            },
          },
        },
      }, client);
      await catalog.initialize();

      const member = catalog.getMember('Orders.status')!;
      expect(member.exposed).toBe(false);
      expect(member.pii).toBe(true);
      expect(member.description).toBe('Overridden description');
      expect(member.allowedGroupBy).toEqual(['Orders.region']);
    });

    it('uses default exposed/pii from catalogConfig.defaults', async () => {
      const client = makeCubeClient();
      const catalog = new CatalogIndex({
        catalogConfig: {
          version: '1.0',
          defaults: { exposed: false, pii: true },
        },
      }, client);
      await catalog.initialize();

      const member = catalog.getMember('Orders.count')!;
      expect(member.exposed).toBe(false);
      expect(member.pii).toBe(true);
    });

    it('skips re-initialization if already initialized', async () => {
      const client = makeCubeClient();
      const catalog = new CatalogIndex({}, client);

      await catalog.initialize();
      await catalog.initialize(); // second call

      expect(client.getMeta).toHaveBeenCalledTimes(1);
    });
  });

  describe('search()', () => {
    let catalog: CatalogIndex;

    beforeEach(async () => {
      const client = makeCubeClient();
      catalog = new CatalogIndex({}, client);
      await catalog.initialize();
    });

    it('returns fuzzy-matched results with scores', () => {
      const results = catalog.search({ query: 'count' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].member.name).toBe('Orders.count');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('filters by type', () => {
      const results = catalog.search({ query: 'orders', types: ['segment'] });
      for (const r of results) {
        expect(r.member.type).toBe('segment');
      }
    });

    it('filters by cube', () => {
      const meta: CubeMetaResponse = {
        cubes: [
          ...makeMeta().cubes,
          {
            name: 'Products',
            title: 'Products',
            measures: [{
              name: 'Products.count',
              title: 'Products Count',
              shortTitle: 'Count',
              type: 'number',
              aggType: 'count',
              isVisible: true,
              public: true,
            }],
            dimensions: [],
            segments: [],
          },
        ],
      };
      const client = makeCubeClient(meta);
      const cat = new CatalogIndex({}, client);
      // Must manually initialize
      cat.initialize().then(() => {
        const results = cat.search({ query: 'count', cubes: ['Products'] });
        for (const r of results) {
          expect(r.member.cubeName).toBe('Products');
        }
      });
    });

    it('filters hidden members by default', () => {
      // Orders.id has isVisible: false
      const results = catalog.search({ query: 'id' });
      const idResult = results.find(r => r.member.name === 'Orders.id');
      expect(idResult).toBeUndefined();
    });

    it('includes hidden members when includeHidden: true', () => {
      const results = catalog.search({ query: 'id', includeHidden: true });
      const idResult = results.find(r => r.member.name === 'Orders.id');
      expect(idResult).toBeDefined();
    });

    it('throws if not initialized', () => {
      const client = makeCubeClient();
      const uninitCatalog = new CatalogIndex({}, client);

      expect(() => uninitCatalog.search({ query: 'test' })).toThrow(DbMcpError);
    });

    it('respects limit parameter', () => {
      const results = catalog.search({ query: 'orders', limit: 1 });
      expect(results).toHaveLength(1);
    });
  });

  describe('describe()', () => {
    let catalog: CatalogIndex;

    beforeEach(async () => {
      const client = makeCubeClient();
      catalog = new CatalogIndex({}, client);
      await catalog.initialize();
    });

    it('returns member with related members from same cube', () => {
      const result = catalog.describe('Orders.count');

      expect(result.member.name).toBe('Orders.count');
      expect(result.relatedMembers).toBeDefined();
      const sameCube = result.relatedMembers!.filter(r => r.relationship === 'same_cube');
      expect(sameCube.length).toBeGreaterThan(0);
      expect(sameCube.every(r => r.name.startsWith('Orders.'))).toBe(true);
    });

    it('includes drill members in related', () => {
      const result = catalog.describe('Orders.count');

      const drills = result.relatedMembers!.filter(r => r.relationship === 'drill_member');
      expect(drills.length).toBeGreaterThan(0);
      const drillNames = drills.map(d => d.name);
      expect(drillNames).toContain('Orders.id');
      expect(drillNames).toContain('Orders.status');
    });

    it('throws unknownMemberError for missing member', () => {
      expect(() => catalog.describe('NonExistent.member')).toThrow(DbMcpError);

      try {
        catalog.describe('NonExistent.member');
      } catch (err) {
        expect((err as DbMcpError).code).toBe('UNKNOWN_MEMBER');
      }
    });
  });

  describe('helpers', () => {
    let catalog: CatalogIndex;

    beforeEach(async () => {
      const client = makeCubeClient();
      catalog = new CatalogIndex({}, client);
      await catalog.initialize();
    });

    it('getMember() returns member or undefined', () => {
      expect(catalog.getMember('Orders.count')).toBeDefined();
      expect(catalog.getMember('Nonexistent.member')).toBeUndefined();
    });

    it('getSuggestions() returns name suggestions', () => {
      const suggestions = catalog.getSuggestions('count');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('Orders.count');
    });

    it('getDefaultSegments() from catalog config, falls back to env config', () => {
      // With catalog config specifying segments
      const client = makeCubeClient();
      const catWithSegments = new CatalogIndex({
        catalogConfig: {
          version: '1.0',
          defaultSegments: ['Orders.active'],
        },
      }, client);
      // Must set initialized state by calling initialize
      catWithSegments.initialize().then(() => {
        expect(catWithSegments.getDefaultSegments()).toEqual(['Orders.active']);
      });

      // Without catalog segments — falls back to env config DEFAULT_SEGMENTS
      const catWithoutSegments = new CatalogIndex({
        catalogConfig: { version: '1.0' },
      }, makeCubeClient());
      catWithoutSegments.initialize().then(() => {
        expect(catWithoutSegments.getDefaultSegments()).toEqual(['Global.defaultSeg']);
      });
    });

    it('getDefaultFilters() from catalog config', async () => {
      const client = makeCubeClient();
      const cat = new CatalogIndex({
        catalogConfig: {
          version: '1.0',
          defaultFilters: [
            { member: 'Orders.status', operator: 'equals', values: ['active'] },
          ],
        },
      }, client);
      await cat.initialize();

      const filters = cat.getDefaultFilters();
      expect(filters).toHaveLength(1);
      expect(filters![0].member).toBe('Orders.status');
    });

    it('refresh() re-initializes from scratch', async () => {
      const client = makeCubeClient();
      const cat = new CatalogIndex({}, client);
      await cat.initialize();
      expect(client.getMeta).toHaveBeenCalledTimes(1);

      await cat.refresh();
      expect(client.getMeta).toHaveBeenCalledTimes(2);
    });
  });
});
