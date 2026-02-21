const API_BASE = '/api';

// Module-level token getter for auth integration
let getTokenFn: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  // Inject auth token if available
  if (getTokenFn) {
    const token = await getTokenFn();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If auth is enabled and we get 401, the session may have expired
    // The ClerkProvider will handle redirect to login
    throw new Error('Authentication required');
  }

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
  getTables: (dbId: string) => fetchApi<{ tables: TableInfo[] }>(`/database/tables?database=${dbId}`),
  getTableDetails: (dbId: string, name: string) => fetchApi<TableDetails>(`/database/tables/${name}?database=${dbId}`),
  getSampleData: (dbId: string, name: string, limit = 10) =>
    fetchApi<{ data: Record<string, unknown>[]; count: number }>(
      `/database/tables/${name}/sample?limit=${limit}&database=${dbId}`
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
  getMeta: (dbId: string) => fetchApi<{ cubes: unknown[] }>(`/cubes?database=${dbId}`),
  generateYaml: (dbId: string, config: CubeConfig) =>
    fetchApi<{ yaml: string }>(`/cubes/generate?database=${dbId}`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  generateEnhanced: (
    dbId: string,
    tableName: string,
    initialConfig: CubeConfig,
    sampleData?: Record<string, unknown>[]
  ) =>
    fetchApi<{ config: CubeConfig; yaml: string }>(`/cubes/generate-enhanced?database=${dbId}`, {
      method: 'POST',
      body: JSON.stringify({ tableName, initialConfig, sampleData }),
    }),
  listFiles: (dbId: string) => fetchApi<{ files: Array<{ name: string; path: string }> }>(`/cubes/files?database=${dbId}`),
  readFile: (dbId: string, name: string) => fetchApi<{ content: string; parsed: unknown }>(`/cubes/files/${name}?database=${dbId}`),
  updateFile: (dbId: string, name: string, content: string) =>
    fetchApi<{ success: boolean }>(`/cubes/files/${name}?database=${dbId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  createFile: (dbId: string, fileName: string, config: CubeConfig) =>
    fetchApi<{ success: boolean; content: string }>(`/cubes/files?database=${dbId}`, {
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
  getMembers: (dbId: string) =>
    fetchApi<{
      members: MemberWithGovernance[];
      defaults: { exposed?: boolean; pii?: boolean };
      defaultSegments: string[];
      defaultFilters: unknown[];
    }>(`/catalog/members?database=${dbId}`),
  getCatalog: (dbId: string) => fetchApi<unknown>(`/catalog?database=${dbId}`),
  updateMember: (dbId: string, name: string, override: CatalogOverride) =>
    fetchApi<{ success: boolean }>(`/catalog/members/${encodeURIComponent(name)}?database=${dbId}`, {
      method: 'PUT',
      body: JSON.stringify(override),
    }),
  removeMember: (dbId: string, name: string) =>
    fetchApi<{ success: boolean }>(`/catalog/members/${encodeURIComponent(name)}?database=${dbId}`, {
      method: 'DELETE',
    }),
  updateDefaults: (dbId: string, defaults: { exposed?: boolean; pii?: boolean }) =>
    fetchApi<{ success: boolean }>(`/catalog/defaults?database=${dbId}`, {
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
  validate: (dbId: string, query: CubeQuery) =>
    fetchApi<{ valid: boolean; errors: string[]; warnings: string[] }>(`/query/validate?database=${dbId}`, {
      method: 'POST',
      body: JSON.stringify(query),
    }),
  execute: (dbId: string, query: CubeQuery) =>
    fetchApi<{ data: unknown[] }>(`/query/execute?database=${dbId}`, {
      method: 'POST',
      body: JSON.stringify(query),
    }),
  getSql: (dbId: string, query: CubeQuery) =>
    fetchApi<{ sql: { sql: string[]; params: unknown[] } }>(`/query/sql?database=${dbId}`, {
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
  getInfo: (dbId: string) => fetchApi<MCPServerInfo>(`/mcp/info?database=${dbId}`),
  getTools: (dbId: string) => fetchApi<{ tools: MCPTool[] }>(`/mcp/tools?database=${dbId}`),
};

// Databases API (Multi-database support)
export type DatabaseType = 'postgres' | 'mysql' | 'bigquery' | 'snowflake' | 'redshift' | 'clickhouse';
export type DatabaseStatus = 'active' | 'inactive' | 'error' | 'initializing';

export interface DatabaseConnection {
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  projectId?: string;
  account?: string;
  warehouse?: string;
  ssl?: boolean;
  options?: Record<string, unknown>;
}

export interface DatabaseConfig {
  id: string;
  name: string;
  description?: string;
  status: DatabaseStatus;
  connection: DatabaseConnection;
  cubeApiUrl?: string;
  jwtSecret?: string;
  catalogPath?: string;
  cubeModelPath?: string;
  maxLimit: number;
  denyMembers: string[];
  defaultSegments: string[];
  returnSql: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastError?: string;
}

export interface DatabaseSummary {
  id: string;
  name: string;
  description?: string;
  status: DatabaseStatus;
  connectionType: DatabaseType;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateDatabaseInput {
  id: string;
  name: string;
  description?: string;
  connection: DatabaseConnection;
  cubeApiUrl?: string;
  jwtSecret?: string;
  maxLimit?: number;
  denyMembers?: string[];
  defaultSegments?: string[];
  returnSql?: boolean;
}

export interface DatabaseTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  details?: {
    version?: string;
    tables?: number;
  };
}

export const databasesApi = {
  list: () => fetchApi<{ databases: DatabaseSummary[] }>('/databases'),

  get: (id: string) => fetchApi<{ database: DatabaseConfig }>(`/databases/${id}`),

  create: (input: CreateDatabaseInput) =>
    fetchApi<{ database: DatabaseConfig }>('/databases', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: Partial<CreateDatabaseInput>) =>
    fetchApi<{ database: DatabaseConfig }>(`/databases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/databases/${id}`, {
      method: 'DELETE',
    }),

  test: (id: string) =>
    fetchApi<DatabaseTestResult>(`/databases/${id}/test`, {
      method: 'POST',
    }),

  activate: (id: string) =>
    fetchApi<{
      success: boolean;
    }>(`/databases/${id}/activate`, {
      method: 'POST',
    }),

  deactivate: (id: string) =>
    fetchApi<{
      success: boolean;
    }>(`/databases/${id}/deactivate`, {
      method: 'POST',
    }),

  initializeDefault: () =>
    fetchApi<{ success: boolean }>('/databases/initialize-default', {
      method: 'POST',
    }),
};

// API Keys API
export interface ApiKeyInfo {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export const apiKeysApi = {
  list: () => fetchApi<{ keys: ApiKeyInfo[] }>('/api-keys'),

  create: (name: string) =>
    fetchApi<{ key: ApiKeyInfo; rawKey: string }>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  revoke: (id: string) =>
    fetchApi<{ success: boolean }>(`/api-keys/${id}`, {
      method: 'DELETE',
    }),
};
