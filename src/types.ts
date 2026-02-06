export type MemberType = 'measure' | 'dimension' | 'segment' | 'timeDimension';

export interface CubeMember {
  name: string;
  type: MemberType;
  title: string;
  shortTitle: string;
  description?: string;
  cubeName: string;
  memberType: string;
  isVisible: boolean;
  public: boolean;
  meta?: Record<string, unknown>;
  // Cube-specific fields
  aggType?: string;
  drillMembers?: string[];
  format?: string;
  primaryKey?: boolean;
  // Time dimension specific
  granularities?: Array<{ name: string; title: string }>;
}

export interface SearchResult {
  member: CubeMember;
  score: number;
  matches?: Array<{
    key: string;
    value: string;
    indices: Array<[number, number]>;
  }>;
}

export interface CatalogOverride {
  exposed?: boolean;
  pii?: boolean;
  description?: string;
  allowedGroupBy?: string[];
  deniedGroupBy?: string[];
  requiresTimeDimension?: boolean;
}

export interface AgentCatalogConfig {
  version: string;
  defaults?: {
    exposed?: boolean;
    pii?: boolean;
  };
  members?: Record<string, CatalogOverride>;
  defaultSegments?: string[];
  defaultFilters?: Array<{
    member: string;
    operator: string;
    values?: string[];
  }>;
}

export interface CubeQuery {
  measures?: string[];
  dimensions?: string[];
  timeDimensions?: Array<{
    dimension: string;
    granularity?: string;
    dateRange?: string | [string, string];
  }>;
  filters?: Array<{
    member?: string;
    dimension?: string;
    operator: string;
    values?: string[];
  }>;
  segments?: string[];
  order?: Record<string, 'asc' | 'desc'> | Array<[string, 'asc' | 'desc']>;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  data: Record<string, unknown>[];
  schema: Array<{
    key: string;
    type: string;
    title: string;
    shortTitle: string;
    meta?: Record<string, unknown>;
  }>;
  normalized_query: CubeQuery;
  lineage: {
    cubes: string[];
    members: string[];
  };
  notes: string[];
  debug: {
    sql: string | null;
    cube_query: CubeQuery;
    query_hash: string;
  };
}

export const ALLOWED_QUERY_KEYS = [
  'measures',
  'dimensions',
  'timeDimensions',
  'filters',
  'segments',
  'order',
  'limit',
  'offset',
] as const;

export type AllowedQueryKey = (typeof ALLOWED_QUERY_KEYS)[number];
