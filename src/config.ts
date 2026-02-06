import { z } from 'zod';

const configSchema = z.object({
  CUBE_API_URL: z.string().url().default('http://localhost:4000/cubejs-api/v1'),
  CUBE_JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  CUBE_JWT_EXPIRES_IN: z.string().default('1h'),
  MAX_LIMIT: z.coerce.number().int().positive().default(1000),
  DEFAULT_SEGMENTS: z.string().optional().transform(v => v ? v.split(',').map(s => s.trim()).filter(Boolean) : []),
  DENY_MEMBERS: z.string().optional().transform(v => v ? v.split(',').map(s => s.trim()).filter(Boolean) : []),
  RETURN_SQL: z.string().optional().transform(v => v === 'true'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  AGENT_CATALOG_PATH: z.string().optional().default('agent_catalog.yaml'),
  MCP_STDIO_ENABLED: z.string().optional().transform(v => v !== 'false').default('true'),
  MCP_HTTP_ENABLED: z.string().optional().transform(v => v === 'true').default('false'),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3002),
  MCP_HTTP_HOST: z.string().default('0.0.0.0'),
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
