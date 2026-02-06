export interface CubeMetaResponse {
  cubes: CubeMeta[];
}

export interface CubeMeta {
  name: string;
  title: string;
  description?: string;
  measures: CubeMeasureMeta[];
  dimensions: CubeDimensionMeta[];
  segments: CubeSegmentMeta[];
}

export interface CubeMeasureMeta {
  name: string;
  title: string;
  shortTitle: string;
  description?: string;
  type: string;
  aggType: string;
  drillMembers?: string[];
  format?: string;
  isVisible?: boolean;
  public?: boolean;
  meta?: Record<string, unknown>;
}

export interface CubeDimensionMeta {
  name: string;
  title: string;
  shortTitle: string;
  description?: string;
  type: string;
  primaryKey?: boolean;
  isVisible?: boolean;
  public?: boolean;
  meta?: Record<string, unknown>;
  granularities?: Array<{ name: string; title: string }>;
}

export interface CubeSegmentMeta {
  name: string;
  title: string;
  shortTitle: string;
  description?: string;
  isVisible?: boolean;
  public?: boolean;
  meta?: Record<string, unknown>;
}

export interface CubeLoadRequest {
  query: CubeQueryPayload;
}

export interface CubeQueryPayload {
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

export interface CubeLoadResponse {
  query: CubeQueryPayload;
  data: Record<string, unknown>[];
  lastRefreshTime: string;
  annotation: {
    measures: Record<string, CubeAnnotation>;
    dimensions: Record<string, CubeAnnotation>;
    segments: Record<string, CubeAnnotation>;
    timeDimensions: Record<string, CubeAnnotation>;
  };
  dataSource: string;
  dbType: string;
  extDbType: string;
  external: boolean;
  slowQuery: boolean;
  total: number | null;
}

export interface CubeAnnotation {
  title: string;
  shortTitle: string;
  type: string;
  format?: string;
  meta?: Record<string, unknown>;
}

export interface CubeSqlResponse {
  sql: {
    sql: string[];
    params: unknown[];
    order?: string;
  };
}

export interface CubeErrorResponse {
  error: string;
  stack?: string;
}
