import * as yaml from 'yaml';
import { getDatabaseStore } from '../../registry/pg-store.js';
import { writeCubeFileToDisk, deleteCubeFileFromDisk } from '../../registry/fs-sync.js';

export interface MeasureConfig {
  name: string;
  type: 'count' | 'sum' | 'avg' | 'count_distinct' | 'min' | 'max';
  sql?: string;
  title?: string;
  description?: string;
  format?: string;
  filters?: Array<{ sql: string }>;
}

export interface DimensionConfig {
  name: string;
  sql: string;
  type: 'string' | 'number' | 'time' | 'boolean';
  title?: string;
  description?: string;
  primary_key?: boolean;
  meta?: Record<string, unknown>;
}

export interface SegmentConfig {
  name: string;
  sql: string;
  title?: string;
  description?: string;
}

export interface CubeConfig {
  name: string;
  sql_table: string;
  title?: string;
  description?: string;
  measures: MeasureConfig[];
  dimensions: DimensionConfig[];
  segments?: SegmentConfig[];
}

export function generateCubeYaml(config: CubeConfig): string {
  const cube: Record<string, unknown> = {
    cubes: [
      {
        name: config.name,
        sql_table: config.sql_table,
        ...(config.title && { title: config.title }),
        ...(config.description && { description: config.description }),
        measures: config.measures.map((m) => ({
          name: m.name,
          type: m.type,
          ...(m.sql && { sql: m.sql }),
          ...(m.title && { title: m.title }),
          ...(m.description && { description: m.description }),
          ...(m.format && { format: m.format }),
          ...(m.filters && { filters: m.filters }),
        })),
        dimensions: config.dimensions.map((d) => ({
          name: d.name,
          sql: d.sql,
          type: d.type,
          ...(d.title && { title: d.title }),
          ...(d.description && { description: d.description }),
          ...(d.primary_key && { primary_key: d.primary_key }),
          ...(d.meta && { meta: d.meta }),
        })),
        ...(config.segments && config.segments.length > 0 && {
          segments: config.segments.map((s) => ({
            name: s.name,
            sql: s.sql,
            ...(s.title && { title: s.title }),
            ...(s.description && { description: s.description }),
          })),
        }),
        pre_aggregations: [],
      },
    ],
  };

  return yaml.stringify(cube, { lineWidth: 0 });
}

/**
 * Validate fileName to prevent path traversal.
 * Only allows alphanumeric, hyphens, underscores, and dots (no slashes or ..).
 */
function validateFileName(fileName: string): string {
  const name = fileName.endsWith('.yml') ? fileName : `${fileName}.yml`;
  if (/[/\\]/.test(name) || name.includes('..') || !(/^[a-zA-Z0-9._-]+$/.test(name))) {
    throw new Error(`Invalid file name: '${fileName}'. Only alphanumeric characters, hyphens, underscores, and dots are allowed.`);
  }
  return name;
}

export async function listCubeFiles(databaseId?: string): Promise<Array<{ name: string; path: string }>> {
  try {
    const store = getDatabaseStore();
    const files = await store.listCubeFiles(databaseId ?? 'default');
    return files.map(f => ({
      name: f.fileName.replace(/\.(yml|yaml)$/, ''),
      path: f.fileName,
    }));
  } catch {
    return [];
  }
}

export async function readCubeFile(fileName: string, databaseId?: string): Promise<{ content: string; parsed: unknown }> {
  const store = getDatabaseStore();
  const safeName = validateFileName(fileName);
  const file = await store.getCubeFile(databaseId ?? 'default', safeName);
  if (!file) {
    throw new Error(`Cube file '${fileName}' not found`);
  }
  const parsed = yaml.parse(file.content);
  return { content: file.content, parsed };
}

export async function writeCubeFile(fileName: string, content: string, databaseId?: string): Promise<void> {
  const dbId = databaseId ?? 'default';
  const safeName = validateFileName(fileName);
  // Validate YAML before writing
  yaml.parse(content);
  // Write to PG (source of truth)
  const store = getDatabaseStore();
  await store.upsertCubeFile(dbId, safeName, content);
  // Write to disk (for Cube.js)
  await writeCubeFileToDisk(dbId, safeName, content);
}

export async function createCubeFile(fileName: string, config: CubeConfig, databaseId?: string): Promise<string> {
  const content = generateCubeYaml(config);
  await writeCubeFile(fileName, content, databaseId);
  return content;
}

export async function deleteCubeFile(fileName: string, databaseId?: string): Promise<void> {
  const dbId = databaseId ?? 'default';
  const safeName = validateFileName(fileName);
  const store = getDatabaseStore();
  await store.deleteCubeFile(dbId, safeName);
  await deleteCubeFileFromDisk(dbId, safeName);
}

export async function getCubeApiMeta(cubeApiUrl: string, jwtSecret: string, databaseId?: string): Promise<unknown> {
  const jwt = await import('jsonwebtoken').catch(() => null);

  let token: string;
  const payload = databaseId ? { databaseId } : {};

  if (jwt) {
    token = jwt.default.sign(payload, jwtSecret, { expiresIn: '1h' });
  } else {
    // Fallback: simple base64 token for development
    token = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
  }

  const response = await fetch(`${cubeApiUrl}/meta`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Cube API error: ${response.statusText}`);
  }

  return response.json();
}
