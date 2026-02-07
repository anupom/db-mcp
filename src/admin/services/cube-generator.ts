import * as yaml from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getDatabaseManager } from '../../registry/manager.js';

// Default fallback path
const DEFAULT_CUBE_MODEL_PATH = process.env.CUBE_MODEL_PATH || './cube/model/cubes';

// Get cube model path for a database
async function getCubeModelPath(databaseId: string = 'default'): Promise<string> {
  const manager = getDatabaseManager();
  if (!manager) {
    // Fallback to environment variable
    console.warn('Registry not available, falling back to environment variable for cube model path');
    return DEFAULT_CUBE_MODEL_PATH;
  }

  const config = manager.getDatabase(databaseId);
  if (!config) {
    throw new Error(`Database '${databaseId}' not found in registry`);
  }

  // Get the cube model path from the registry manager
  return manager.getCubeModelPath(databaseId, config) + '/cubes';
}

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

export async function listCubeFiles(databaseId?: string): Promise<Array<{ name: string; path: string }>> {
  try {
    const cubeModelPath = await getCubeModelPath(databaseId);
    const files = await fs.readdir(cubeModelPath);
    const yamlFiles = files.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    return yamlFiles.map((f) => ({
      name: f.replace(/\.(yml|yaml)$/, ''),
      path: path.join(cubeModelPath, f),
    }));
  } catch {
    return [];
  }
}

export async function readCubeFile(fileName: string, databaseId?: string): Promise<{ content: string; parsed: unknown }> {
  const cubeModelPath = await getCubeModelPath(databaseId);
  const filePath = path.join(cubeModelPath, fileName.endsWith('.yml') ? fileName : `${fileName}.yml`);
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = yaml.parse(content);
  return { content, parsed };
}

export async function writeCubeFile(fileName: string, content: string, databaseId?: string): Promise<void> {
  const cubeModelPath = await getCubeModelPath(databaseId);
  const filePath = path.join(cubeModelPath, fileName.endsWith('.yml') ? fileName : `${fileName}.yml`);
  // Validate YAML before writing
  yaml.parse(content);
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function createCubeFile(fileName: string, config: CubeConfig, databaseId?: string): Promise<string> {
  const content = generateCubeYaml(config);
  await writeCubeFile(fileName, content, databaseId);
  return content;
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
  });

  if (!response.ok) {
    throw new Error(`Cube API error: ${response.statusText}`);
  }

  return response.json();
}
