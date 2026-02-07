import Fuse from 'fuse.js';
import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { getConfig } from '../config.js';
import type { CubeClient } from '../cube/client.js';
import { unknownMemberError, catalogError } from '../errors.js';
import { getLogger } from '../utils/logger.js';
import type { CubeMember, AgentCatalogConfig, MemberType } from '../types.js';
import type {
  IndexedMember,
  CatalogSearchOptions,
  CatalogSearchResult,
  CatalogDescribeResult,
} from './types.js';
import type { CubeMetaResponse } from '../cube/types.js';

/**
 * Configuration for creating a CatalogIndex instance
 */
export interface CatalogIndexConfig {
  catalogPath?: string;
  databaseId?: string;
}

export class CatalogIndex {
  private members: Map<string, IndexedMember> = new Map();
  private fuse: Fuse<IndexedMember> | null = null;
  private catalogConfig: AgentCatalogConfig | null = null;
  private logger = getLogger().child({ component: 'CatalogIndex' });
  private initialized = false;

  private catalogPath: string;
  private cubeClient: CubeClient;
  private databaseId?: string;

  constructor(config: CatalogIndexConfig, cubeClient: CubeClient) {
    const globalConfig = getConfig();
    this.catalogPath = config.catalogPath ?? globalConfig.AGENT_CATALOG_PATH;
    this.cubeClient = cubeClient;
    this.databaseId = config.databaseId;

    if (this.databaseId) {
      this.logger = this.logger.child({ databaseId: this.databaseId });
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('Initializing catalog index');

    // Load agent catalog config
    await this.loadCatalogConfig();

    // Fetch Cube metadata and build index
    const meta = await this.cubeClient.getMeta();
    this.buildIndex(meta);

    this.initialized = true;
    this.logger.info({ memberCount: this.members.size }, 'Catalog index initialized');
  }

  private async loadCatalogConfig(): Promise<void> {
    try {
      const content = await readFile(this.catalogPath, 'utf-8');
      this.catalogConfig = parseYaml(content) as AgentCatalogConfig;
      this.logger.debug({ path: this.catalogPath }, 'Loaded agent catalog config');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.warn({ path: this.catalogPath }, 'Agent catalog file not found, using defaults');
        this.catalogConfig = { version: '1.0' };
      } else {
        throw catalogError(`Failed to load agent catalog: ${(err as Error).message}`);
      }
    }
  }

  private buildIndex(meta: CubeMetaResponse): void {
    const defaults = this.catalogConfig?.defaults ?? { exposed: true, pii: false };

    for (const cube of meta.cubes) {
      // Index measures
      for (const measure of cube.measures) {
        const member = this.createIndexedMember({
          name: measure.name,
          type: 'measure',
          title: measure.title,
          shortTitle: measure.shortTitle,
          description: measure.description,
          cubeName: cube.name,
          memberType: measure.type,
          isVisible: measure.isVisible ?? true,
          public: measure.public ?? true,
          aggType: measure.aggType,
          drillMembers: measure.drillMembers,
          format: measure.format,
          meta: measure.meta,
        }, defaults);
        this.members.set(measure.name, member);
      }

      // Index dimensions
      for (const dimension of cube.dimensions) {
        const memberType: MemberType = dimension.type === 'time' ? 'timeDimension' : 'dimension';
        const member = this.createIndexedMember({
          name: dimension.name,
          type: memberType,
          title: dimension.title,
          shortTitle: dimension.shortTitle,
          description: dimension.description,
          cubeName: cube.name,
          memberType: dimension.type,
          isVisible: dimension.isVisible ?? true,
          public: dimension.public ?? true,
          primaryKey: dimension.primaryKey,
          meta: dimension.meta,
          granularities: dimension.granularities,
        }, defaults);
        this.members.set(dimension.name, member);
      }

      // Index segments
      for (const segment of cube.segments) {
        const member = this.createIndexedMember({
          name: segment.name,
          type: 'segment',
          title: segment.title,
          shortTitle: segment.shortTitle,
          description: segment.description,
          cubeName: cube.name,
          memberType: 'segment',
          isVisible: segment.isVisible ?? true,
          public: segment.public ?? true,
          meta: segment.meta,
        }, defaults);
        this.members.set(segment.name, member);
      }
    }

    // Build Fuse.js index for fuzzy search
    this.fuse = new Fuse(Array.from(this.members.values()), {
      keys: [
        { name: 'name', weight: 0.4 },
        { name: 'title', weight: 0.3 },
        { name: 'description', weight: 0.2 },
        { name: 'shortTitle', weight: 0.1 },
      ],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }

  private createIndexedMember(
    base: CubeMember,
    defaults: { exposed?: boolean; pii?: boolean }
  ): IndexedMember {
    const override = this.catalogConfig?.members?.[base.name];

    return {
      ...base,
      exposed: override?.exposed ?? defaults.exposed ?? true,
      pii: override?.pii ?? defaults.pii ?? false,
      allowedGroupBy: override?.allowedGroupBy,
      deniedGroupBy: override?.deniedGroupBy,
      requiresTimeDimension: override?.requiresTimeDimension,
      description: override?.description ?? base.description,
      catalogOverride: override,
    };
  }

  search(options: CatalogSearchOptions): CatalogSearchResult[] {
    if (!this.fuse) {
      throw catalogError('Catalog not initialized');
    }

    const { query, types, cubes, limit = 10, includeHidden = false } = options;

    let results = this.fuse.search(query);

    // Filter by type
    if (types?.length) {
      results = results.filter(r => types.includes(r.item.type));
    }

    // Filter by cube
    if (cubes?.length) {
      results = results.filter(r => cubes.includes(r.item.cubeName));
    }

    // Filter hidden members
    if (!includeHidden) {
      results = results.filter(r => r.item.isVisible && r.item.public && r.item.exposed);
    }

    return results.slice(0, limit).map(r => ({
      member: r.item,
      score: 1 - (r.score ?? 0),
      matches: r.matches?.map(m => ({
        key: m.key ?? '',
        value: m.value ?? '',
        indices: m.indices as Array<[number, number]>,
      })),
    }));
  }

  describe(memberName: string): CatalogDescribeResult {
    const member = this.members.get(memberName);

    if (!member) {
      const suggestions = this.getSuggestions(memberName);
      throw unknownMemberError(memberName, suggestions);
    }

    // Find related members from the same cube
    const relatedMembers: CatalogDescribeResult['relatedMembers'] = [];

    for (const [, m] of this.members) {
      if (m.name === memberName) continue;

      if (m.cubeName === member.cubeName) {
        relatedMembers.push({
          name: m.name,
          type: m.type,
          relationship: 'same_cube',
        });
      }

      if (member.drillMembers?.includes(m.name)) {
        relatedMembers.push({
          name: m.name,
          type: m.type,
          relationship: 'drill_member',
        });
      }
    }

    return { member, relatedMembers };
  }

  getMember(name: string): IndexedMember | undefined {
    return this.members.get(name);
  }

  getAllMembers(): IndexedMember[] {
    return Array.from(this.members.values());
  }

  getSuggestions(query: string, limit = 5): string[] {
    if (!this.fuse) return [];

    const results = this.fuse.search(query, { limit });
    return results.map(r => r.item.name);
  }

  getDefaultSegments(): string[] {
    return this.catalogConfig?.defaultSegments ?? getConfig().DEFAULT_SEGMENTS;
  }

  getDefaultFilters(): AgentCatalogConfig['defaultFilters'] {
    return this.catalogConfig?.defaultFilters ?? [];
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async refresh(): Promise<void> {
    this.initialized = false;
    this.members.clear();
    this.fuse = null;
    await this.initialize();
  }
}

/**
 * Create a new CatalogIndex instance with specific configuration
 */
export function createCatalogIndex(
  config: CatalogIndexConfig,
  cubeClient: CubeClient
): CatalogIndex {
  return new CatalogIndex(config, cubeClient);
}
