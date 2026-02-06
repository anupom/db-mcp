import pino from 'pino';
import { getConfig } from '../config.js';

let logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (logger) return logger;

  const config = getConfig();

  logger = pino({
    name: 'db-mcp',
    level: config.LOG_LEVEL,
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino/file',
            options: { destination: 2 }, // stderr
          }
        : undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return logger;
}

export function createChildLogger(bindings: pino.Bindings): pino.Logger {
  return getLogger().child(bindings);
}

export interface AuditLogEntry {
  event: 'query.execute' | 'catalog.search' | 'catalog.describe' | 'error';
  tool: string;
  input?: Record<string, unknown>;
  result?: 'success' | 'error';
  error?: {
    code: string;
    message: string;
  };
  duration_ms?: number;
  query_hash?: string;
  members?: string[];
  row_count?: number;
}

export function auditLog(entry: AuditLogEntry): void {
  const log = getLogger();
  log.info({ audit: true, ...entry }, `[AUDIT] ${entry.event}`);
}
