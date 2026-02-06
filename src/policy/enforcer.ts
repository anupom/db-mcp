import { getConfig } from '../config.js';
import { getCatalogIndex } from '../catalog/index.js';
import {
  missingLimitError,
  limitTooHighError,
  memberNotExposedError,
  piiMemberBlockedError,
  unknownMemberError,
  groupByNotAllowedError,
  queryKeyNotAllowedError,
} from '../errors.js';
import { getLogger } from '../utils/logger.js';
import type { CubeQuery, ALLOWED_QUERY_KEYS } from '../types.js';
import type { PolicyConfig, PolicyContext } from './types.js';

const ALLOWED_KEYS = new Set<string>([
  'measures',
  'dimensions',
  'timeDimensions',
  'filters',
  'segments',
  'order',
  'limit',
  'offset',
]);

export class PolicyEnforcer {
  private config: PolicyConfig;
  private logger = getLogger().child({ component: 'PolicyEnforcer' });

  constructor(config?: Partial<PolicyConfig>) {
    const envConfig = getConfig();
    this.config = {
      maxLimit: config?.maxLimit ?? envConfig.MAX_LIMIT,
      denyMembers: config?.denyMembers ?? envConfig.DENY_MEMBERS,
      returnSql: config?.returnSql ?? envConfig.RETURN_SQL,
      defaultSegments: config?.defaultSegments ?? [],
      defaultFilters: config?.defaultFilters ?? [],
    };
  }

  async validate(query: CubeQuery): Promise<void> {
    this.logger.debug({ query }, 'Validating query');

    // Check for disallowed query keys
    for (const key of Object.keys(query)) {
      if (!ALLOWED_KEYS.has(key)) {
        throw queryKeyNotAllowedError(key, Array.from(ALLOWED_KEYS));
      }
    }

    // Validate limit
    if (query.limit === undefined) {
      throw missingLimitError();
    }

    if (query.limit > this.config.maxLimit) {
      throw limitTooHighError(query.limit, this.config.maxLimit);
    }

    const catalog = await getCatalogIndex();

    // Collect all members to validate (with defensive array checks)
    const allMembers: string[] = [];
    if (Array.isArray(query.measures)) allMembers.push(...query.measures);
    if (Array.isArray(query.dimensions)) allMembers.push(...query.dimensions);
    if (Array.isArray(query.segments)) allMembers.push(...query.segments);
    if (Array.isArray(query.timeDimensions)) {
      allMembers.push(...query.timeDimensions.map(td => td.dimension));
    }
    if (Array.isArray(query.filters)) {
      allMembers.push(...query.filters.map(f => f.member ?? f.dimension).filter(Boolean) as string[]);
    }

    // Validate each member
    for (const memberName of allMembers) {
      const member = catalog.getMember(memberName);

      if (!member) {
        const suggestions = catalog.getSuggestions(memberName);
        throw unknownMemberError(memberName, suggestions);
      }

      // Check if member is exposed
      if (!member.exposed) {
        throw memberNotExposedError(memberName);
      }

      // Check if member is PII
      if (member.pii) {
        throw piiMemberBlockedError(memberName);
      }

      // Check deny list
      if (this.config.denyMembers.includes(memberName)) {
        throw piiMemberBlockedError(memberName);
      }
    }

    // Validate group-by restrictions
    const dimensions = [
      ...(query.dimensions ?? []),
      ...(query.timeDimensions?.map(td => td.dimension) ?? []),
    ];

    for (const measureName of query.measures ?? []) {
      const measure = catalog.getMember(measureName);
      if (!measure) continue;

      // Check allowed group-by
      if (measure.allowedGroupBy && measure.allowedGroupBy.length > 0) {
        for (const dim of dimensions) {
          if (!measure.allowedGroupBy.includes(dim)) {
            throw groupByNotAllowedError(measureName, dim);
          }
        }
      }

      // Check denied group-by
      if (measure.deniedGroupBy) {
        for (const dim of dimensions) {
          if (measure.deniedGroupBy.includes(dim)) {
            throw groupByNotAllowedError(measureName, dim);
          }
        }
      }
    }

    this.logger.debug('Query validation passed');
  }

  async applyDefaults(query: CubeQuery): Promise<PolicyContext> {
    const catalog = await getCatalogIndex();
    const notes: string[] = [];

    const normalizedQuery: CubeQuery = { ...query };

    // Apply default segments
    const defaultSegments = [
      ...this.config.defaultSegments,
      ...catalog.getDefaultSegments(),
    ];

    if (defaultSegments.length > 0) {
      const existingSegments = new Set(normalizedQuery.segments ?? []);
      const addedSegments: string[] = [];

      for (const segment of defaultSegments) {
        if (!existingSegments.has(segment)) {
          addedSegments.push(segment);
        }
      }

      if (addedSegments.length > 0) {
        normalizedQuery.segments = [
          ...(normalizedQuery.segments ?? []),
          ...addedSegments,
        ];
        notes.push(`Applied default segments: ${addedSegments.join(', ')}`);
      }
    }

    // Apply default filters
    const catalogFilters = catalog.getDefaultFilters() ?? [];
    const defaultFilters = [
      ...this.config.defaultFilters,
      ...catalogFilters,
    ];

    if (defaultFilters.length > 0) {
      const existingFilterMembers = new Set(
        (normalizedQuery.filters ?? []).map(f => f.member ?? f.dimension)
      );

      const addedFilters: typeof defaultFilters = [];

      for (const filter of defaultFilters) {
        if (!existingFilterMembers.has(filter.member)) {
          addedFilters.push(filter);
        }
      }

      if (addedFilters.length > 0) {
        normalizedQuery.filters = [
          ...(normalizedQuery.filters ?? []),
          ...addedFilters.map(f => ({
            member: f.member,
            operator: f.operator,
            values: f.values,
          })),
        ];
        notes.push(`Applied default filters on: ${addedFilters.map(f => f.member).join(', ')}`);
      }
    }

    return {
      originalQuery: query,
      normalizedQuery,
      notes,
    };
  }

  shouldReturnSql(): boolean {
    return this.config.returnSql;
  }
}

let defaultEnforcer: PolicyEnforcer | null = null;

export function getPolicyEnforcer(): PolicyEnforcer {
  if (!defaultEnforcer) {
    defaultEnforcer = new PolicyEnforcer();
  }
  return defaultEnforcer;
}
