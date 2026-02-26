import { getLogger } from '../../utils/logger.js';
import { getTables, getTableDetails } from './postgres.js';
import { createCubeFile, type CubeConfig } from './cube-generator.js';

const logger = getLogger().child({ component: 'AutoIntrospect' });

/**
 * Introspect a database's tables and auto-generate cube YAML files.
 * Rule-based only (no LLM) — fast, no API key needed.
 * Per-table error isolation — one failing table doesn't block others.
 */
export async function introspectAndGenerateCubes(databaseId: string): Promise<{
  generated: string[];
  failed: Array<{ table: string; error: string }>;
}> {
  const generated: string[] = [];
  const failed: Array<{ table: string; error: string }> = [];

  logger.info({ databaseId }, 'Starting auto-introspection');

  const tables = await getTables(databaseId);
  if (tables.length === 0) {
    logger.warn({ databaseId }, 'No tables found for introspection');
    return { generated, failed };
  }

  logger.info({ databaseId, tableCount: tables.length }, 'Found tables to introspect');

  for (const table of tables) {
    try {
      const details = await getTableDetails(table.table_name, databaseId);

      const cubeName = table.table_name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
        .replace(/^[a-z]/, (c) => c.toUpperCase());

      const config: CubeConfig = {
        name: cubeName,
        sql_table: `public.${table.table_name}`,
        title: table.table_name
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        measures: details.suggestedMeasures.map((m) => ({
          name: m.name,
          type: m.type,
          ...(m.sql && { sql: m.sql }),
          title: m.title,
        })),
        dimensions: details.suggestedDimensions.map((d) => ({
          name: d.name,
          sql: d.sql,
          type: d.type,
          title: d.title,
          ...(d.primaryKey && { primary_key: true }),
        })),
      };

      await createCubeFile(table.table_name, config, databaseId);
      generated.push(table.table_name);
      logger.debug({ databaseId, table: table.table_name }, 'Generated cube');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ table: table.table_name, error: message });
      logger.warn({ databaseId, table: table.table_name, error: message }, 'Failed to generate cube for table');
    }
  }

  logger.info(
    { databaseId, generated: generated.length, failed: failed.length },
    'Auto-introspection complete'
  );

  return { generated, failed };
}
