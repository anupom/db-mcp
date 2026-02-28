import { z } from 'zod';

/**
 * Supported database types for connections
 */
export type DatabaseType = 'postgres' | 'mysql' | 'bigquery' | 'snowflake' | 'redshift' | 'clickhouse';

/**
 * Database connection configuration
 */
export const DatabaseConnectionSchema = z.object({
  type: z.enum(['postgres', 'mysql', 'bigquery', 'snowflake', 'redshift', 'clickhouse']),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  database: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  // For cloud databases
  projectId: z.string().optional(), // BigQuery
  account: z.string().optional(), // Snowflake
  warehouse: z.string().optional(), // Snowflake
  // SSL options
  ssl: z.boolean().optional(),
  // Additional connection options
  options: z.record(z.string(), z.unknown()).optional(),
});

export type DatabaseConnection = z.infer<typeof DatabaseConnectionSchema>;

/**
 * Database status
 */
export type DatabaseStatus = 'active' | 'inactive' | 'error' | 'initializing';

/**
 * Full database configuration stored in registry
 */
export const DatabaseConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ID must be URL-safe lowercase alphanumeric with hyphens'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive', 'error', 'initializing']).default('inactive'),
  connection: DatabaseConnectionSchema,

  // Cube.js configuration
  cubeApiUrl: z.string().url().optional(), // Falls back to global if not set
  jwtSecret: z.string().min(32).optional(), // Falls back to global if not set

  // Policy configuration
  maxLimit: z.number().int().positive().default(1000),
  denyMembers: z.array(z.string()).default([]),
  defaultSegments: z.array(z.string()).default([]),
  returnSql: z.boolean().default(false),

  // Timestamps
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),

  // Error info when status is 'error'
  lastError: z.string().optional(),

  // Tenant ID for multi-tenant SaaS mode (undefined in self-hosted)
  tenantId: z.string().optional(),

  // Original user-facing identifier before tenant scoping (e.g. "analytics")
  // The actual `id` may be scoped to "{slug}-{hash}" in SaaS mode
  slug: z.string().optional(),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/**
 * Database configuration for creation (without auto-generated fields)
 */
export const CreateDatabaseConfigSchema = DatabaseConfigSchema.omit({
  status: true,
  createdAt: true,
  updatedAt: true,
  lastError: true,
});

export type CreateDatabaseConfig = z.infer<typeof CreateDatabaseConfigSchema>;

/**
 * Database configuration for updates (all fields optional except id)
 */
export const UpdateDatabaseConfigSchema = DatabaseConfigSchema.partial().required({ id: true }).extend({
  // Allow null to explicitly clear cubeApiUrl (fall back to env var default)
  cubeApiUrl: z.string().url().optional().nullable(),
});

export type UpdateDatabaseConfig = z.infer<typeof UpdateDatabaseConfigSchema>;

/**
 * Database summary for listing
 */
export interface DatabaseSummary {
  id: string;
  name: string;
  description?: string;
  status: DatabaseStatus;
  connectionType: DatabaseType;
  tenantId?: string;
  slug?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Database test result
 */
export interface DatabaseTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  details?: {
    version?: string;
    tables?: number;
  };
}

/**
 * Database registry events
 */
export type DatabaseRegistryEvent =
  | { type: 'created'; database: DatabaseConfig }
  | { type: 'updated'; database: DatabaseConfig }
  | { type: 'deleted'; databaseId: string }
  | { type: 'activated'; databaseId: string }
  | { type: 'deactivated'; databaseId: string }
  | { type: 'error'; databaseId: string; error: string };
