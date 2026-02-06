import type { CubeQuery } from '../types.js';

export interface PolicyConfig {
  maxLimit: number;
  denyMembers: string[];
  returnSql: boolean;
  defaultSegments: string[];
  defaultFilters: Array<{
    member: string;
    operator: string;
    values?: string[];
  }>;
}

export interface PolicyValidationResult {
  valid: boolean;
  errors: PolicyError[];
  warnings: PolicyWarning[];
}

export interface PolicyError {
  code: string;
  message: string;
  member?: string;
  suggestions?: string[];
}

export interface PolicyWarning {
  code: string;
  message: string;
  member?: string;
}

export interface NormalizedQuery extends CubeQuery {
  // Query with defaults applied
}

export interface PolicyContext {
  originalQuery: CubeQuery;
  normalizedQuery: NormalizedQuery;
  notes: string[];
}
