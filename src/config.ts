import { z } from 'zod';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Go up from dist/config.js or src/config.ts to project root
const projectRoot = resolve(__dirname, '..');

const configSchema = z.object({
  // Cube.js configuration
  CUBE_API_URL: z.string().url().default('http://localhost:4000/cubejs-api/v1'),
  CUBE_JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  CUBE_JWT_EXPIRES_IN: z.string().default('1h'),

  // Query limits and governance
  MAX_LIMIT: z.coerce.number().int().positive().default(1000),
  DEFAULT_SEGMENTS: z.string().optional().transform(v => v ? v.split(',').map(s => s.trim()).filter(Boolean) : []),
  DENY_MEMBERS: z.string().optional().transform(v => v ? v.split(',').map(s => s.trim()).filter(Boolean) : []),
  RETURN_SQL: z.string().optional().transform(v => v === 'true'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Catalog
  AGENT_CATALOG_PATH: z.string().optional().default('agent_catalog.yaml'),

  // MCP transport configuration
  MCP_STDIO_ENABLED: z.string().optional().transform(v => v !== 'false').default('true'),
  MCP_HTTP_ENABLED: z.string().optional().transform(v => v === 'true').default('false'),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3000),
  MCP_HTTP_HOST: z.string().default('0.0.0.0'),

  // Multi-database configuration
  ADMIN_SECRET: z.string().min(32, 'Admin secret must be at least 32 characters').optional(),
  // DATA_DIR is resolved relative to the project root, not the current working directory
  DATA_DIR: z.string().default('./data').transform(v => {
    // If absolute path, use as-is
    if (v.startsWith('/')) return v;
    // If relative path, resolve relative to project root (where the dist folder is)
    return join(projectRoot, v);
  }),

  // Anthropic API key for LLM features (chat, cube enhancement)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Clerk authentication (SaaS mode — when both are set, auth is enabled)
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

let config: Config | null = null;

export function loadConfig(): Config {
  if (config) return config;

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map(issue => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  config = result.data;
  return config;
}

export function getConfig(): Config {
  if (!config) {
    return loadConfig();
  }
  return config;
}
