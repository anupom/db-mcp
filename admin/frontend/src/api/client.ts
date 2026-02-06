const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

// Database API
export interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface TableInfo {
  table_name: string;
  table_schema: string;
  columns: TableColumn[];
}

export interface SuggestedMeasure {
  name: string;
  type: string;
  sql?: string;
  column?: string;
  title: string;
}

export interface SuggestedDimension {
  name: string;
  sql: string;
  type: string;
  title: string;
  primaryKey?: boolean;
}

export interface TableDetails {
  table: TableInfo;
  foreignKeys: Array<{
    constraint_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
  }>;
  suggestedMeasures: SuggestedMeasure[];
  suggestedDimensions: SuggestedDimension[];
}

export const databaseApi = {
  getTables: () => fetchApi<{ tables: TableInfo[] }>('/database/tables'),
  getTableDetails: (name: string) => fetchApi<TableDetails>(`/database/tables/${name}`),
  getSampleData: (name: string, limit = 10) =>
    fetchApi<{ data: Record<string, unknown>[]; count: number }>(
      `/database/tables/${name}/sample?limit=${limit}`
    ),
};

// Cubes API
export interface CubeConfig {
  name: string;
  sql_table: string;
  title?: string;
  description?: string;
  measures: Array<{
    name: string;
    type: string;
    sql?: string;
    title?: string;
    description?: string;
  }>;
  dimensions: Array<{
    name: string;
    sql: string;
    type: string;
    title?: string;
    primary_key?: boolean;
  }>;
}

export const cubesApi = {
  getMeta: () => fetchApi<{ cubes: unknown[] }>('/cubes'),
  generateYaml: (config: CubeConfig) =>
    fetchApi<{ yaml: string }>('/cubes/generate', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  listFiles: () => fetchApi<{ files: Array<{ name: string; path: string }> }>('/cubes/files'),
  readFile: (name: string) => fetchApi<{ content: string; parsed: unknown }>(`/cubes/files/${name}`),
  updateFile: (name: string, content: string) =>
    fetchApi<{ success: boolean }>(`/cubes/files/${name}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  createFile: (fileName: string, config: CubeConfig) =>
    fetchApi<{ success: boolean; content: string }>('/cubes/files', {
      method: 'POST',
      body: JSON.stringify({ fileName, config }),
    }),
};

// Catalog API
export interface MemberWithGovernance {
  name: string;
  type: 'measure' | 'dimension' | 'segment';
  cubeName: string;
  memberName: string;
  title?: string;
  description?: string;
  cubeDescription?: string;
  cubeType?: string;
  exposed: boolean;
  pii: boolean;
  allowedGroupBy?: string[];
  deniedGroupBy?: string[];
  requiresTimeDimension?: boolean;
  hasOverride: boolean;
}

export interface CatalogOverride {
  exposed?: boolean;
  pii?: boolean;
  description?: string;
  allowedGroupBy?: string[];
  deniedGroupBy?: string[];
  requiresTimeDimension?: boolean;
}

export const catalogApi = {
  getMembers: () =>
    fetchApi<{
      members: MemberWithGovernance[];
      defaults: { exposed?: boolean; pii?: boolean };
      defaultSegments: string[];
      defaultFilters: unknown[];
    }>('/catalog/members'),
  getCatalog: () => fetchApi<unknown>('/catalog'),
  updateMember: (name: string, override: CatalogOverride) =>
    fetchApi<{ success: boolean }>(`/catalog/members/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(override),
    }),
  removeMember: (name: string) =>
    fetchApi<{ success: boolean }>(`/catalog/members/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  updateDefaults: (defaults: { exposed?: boolean; pii?: boolean }) =>
    fetchApi<{ success: boolean }>('/catalog/defaults', {
      method: 'PUT',
      body: JSON.stringify(defaults),
    }),
};

// Query API
export interface CubeQuery {
  measures?: string[];
  dimensions?: string[];
  timeDimensions?: Array<{
    dimension: string;
    granularity?: string;
    dateRange?: string | string[];
  }>;
  filters?: Array<{
    member: string;
    operator: string;
    values?: (string | number | boolean)[];
  }>;
  segments?: string[];
  order?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  offset?: number;
}

export const queryApi = {
  validate: (query: CubeQuery) =>
    fetchApi<{ valid: boolean; errors: string[]; warnings: string[] }>('/query/validate', {
      method: 'POST',
      body: JSON.stringify(query),
    }),
  execute: (query: CubeQuery) =>
    fetchApi<{ data: unknown[] }>('/query/execute', {
      method: 'POST',
      body: JSON.stringify(query),
    }),
  getSql: (query: CubeQuery) =>
    fetchApi<{ sql: { sql: string[]; params: unknown[] } }>('/query/sql', {
      method: 'POST',
      body: JSON.stringify(query),
    }),
};

// MCP API
export interface MCPToolSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolSchema;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  transports: {
    stdio: boolean;
    http: boolean;
  };
  endpoint?: string;
  command: string;
  description: string;
}

export const mcpApi = {
  getInfo: () => fetchApi<MCPServerInfo>('/mcp/info'),
  getTools: () => fetchApi<{ tools: MCPTool[] }>('/mcp/tools'),
};
