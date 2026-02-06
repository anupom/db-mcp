import { createHash } from 'crypto';
import { getCubeClient } from '../cube/client.js';
import { getCatalogIndex } from '../catalog/index.js';
import { getPolicyEnforcer } from '../policy/enforcer.js';
import { getLogger, auditLog } from '../utils/logger.js';
import type { CubeQuery, QueryResult } from '../types.js';
import type { CubeLoadResponse } from '../cube/types.js';

export class QuerySemantic {
  private logger = getLogger().child({ component: 'QuerySemantic' });

  async execute(query: CubeQuery): Promise<QueryResult> {
    const startTime = Date.now();
    const queryHash = this.computeQueryHash(query);

    this.logger.info({ queryHash }, 'Executing semantic query');

    try {
      // Get policy enforcer and validate
      const enforcer = getPolicyEnforcer();
      await enforcer.validate(query);

      // Apply defaults
      const { normalizedQuery, notes } = await enforcer.applyDefaults(query);

      // Execute query
      const cubeClient = getCubeClient();
      const response = await cubeClient.load(normalizedQuery);

      // Get SQL if configured
      let sql: string | null = null;
      if (enforcer.shouldReturnSql()) {
        try {
          const sqlResponse = await cubeClient.getSql(normalizedQuery);
          sql = sqlResponse.sql.sql.join('\n');
        } catch (err) {
          this.logger.warn({ error: err }, 'Failed to get SQL');
        }
      }

      // Build result
      const result = this.buildResult(response, normalizedQuery, notes, sql, queryHash);

      // Audit log
      const duration = Date.now() - startTime;
      auditLog({
        event: 'query.execute',
        tool: 'query.semantic',
        result: 'success',
        duration_ms: duration,
        query_hash: queryHash,
        members: this.extractMembers(normalizedQuery),
        row_count: result.data.length,
      });

      this.logger.info(
        { queryHash, rowCount: result.data.length, duration },
        'Query executed successfully'
      );

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;

      auditLog({
        event: 'query.execute',
        tool: 'query.semantic',
        result: 'error',
        duration_ms: duration,
        query_hash: queryHash,
        error: {
          code: (err as { code?: string }).code ?? 'UNKNOWN',
          message: (err as Error).message,
        },
      });

      throw err;
    }
  }

  private buildResult(
    response: CubeLoadResponse,
    normalizedQuery: CubeQuery,
    notes: string[],
    sql: string | null,
    queryHash: string
  ): QueryResult {
    // Build schema from annotations (with defensive checks for undefined)
    const schema: QueryResult['schema'] = [];
    const annotation = response.annotation ?? {};

    for (const [key, ann] of Object.entries(annotation.measures ?? {})) {
      schema.push({
        key,
        type: ann.type,
        title: ann.title,
        shortTitle: ann.shortTitle,
        meta: ann.meta,
      });
    }

    for (const [key, ann] of Object.entries(annotation.dimensions ?? {})) {
      schema.push({
        key,
        type: ann.type,
        title: ann.title,
        shortTitle: ann.shortTitle,
        meta: ann.meta,
      });
    }

    for (const [key, ann] of Object.entries(annotation.timeDimensions ?? {})) {
      schema.push({
        key,
        type: ann.type,
        title: ann.title,
        shortTitle: ann.shortTitle,
        meta: ann.meta,
      });
    }

    // Extract lineage info
    const cubes = new Set<string>();
    const members = this.extractMembers(normalizedQuery);

    for (const member of members) {
      const cubeName = member.split('.')[0];
      cubes.add(cubeName);
    }

    return {
      data: response.data,
      schema,
      normalized_query: normalizedQuery,
      lineage: {
        cubes: Array.from(cubes),
        members,
      },
      notes,
      debug: {
        sql,
        cube_query: response.query,
        query_hash: queryHash,
      },
    };
  }

  private extractMembers(query: CubeQuery): string[] {
    const members: string[] = [];

    if (query.measures) members.push(...query.measures);
    if (query.dimensions) members.push(...query.dimensions);
    if (query.segments) members.push(...query.segments);
    if (query.timeDimensions) {
      members.push(...query.timeDimensions.map(td => td.dimension));
    }
    if (query.filters) {
      for (const f of query.filters) {
        if (f.member) members.push(f.member);
        if (f.dimension) members.push(f.dimension);
      }
    }

    return [...new Set(members)];
  }

  private computeQueryHash(query: CubeQuery): string {
    const normalized = JSON.stringify(query, Object.keys(query).sort());
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }
}

let defaultQuerySemantic: QuerySemantic | null = null;

export function getQuerySemantic(): QuerySemantic {
  if (!defaultQuerySemantic) {
    defaultQuerySemantic = new QuerySemantic();
  }
  return defaultQuerySemantic;
}
