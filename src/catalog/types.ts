import type { CubeMember, CatalogOverride } from '../types.js';

export interface IndexedMember extends CubeMember {
  exposed: boolean;
  pii: boolean;
  allowedGroupBy?: string[];
  deniedGroupBy?: string[];
  requiresTimeDimension?: boolean;
  catalogOverride?: CatalogOverride;
}

export interface CatalogSearchOptions {
  query: string;
  types?: Array<'measure' | 'dimension' | 'segment' | 'timeDimension'>;
  cubes?: string[];
  limit?: number;
  includeHidden?: boolean;
}

export interface CatalogSearchResult {
  member: IndexedMember;
  score: number;
  matches?: Array<{
    key: string;
    value: string;
    indices: Array<[number, number]>;
  }>;
}

export interface CatalogDescribeResult {
  member: IndexedMember;
  relatedMembers?: Array<{
    name: string;
    type: string;
    relationship: 'same_cube' | 'drill_member' | 'related';
  }>;
}
