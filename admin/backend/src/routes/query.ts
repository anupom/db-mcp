import { Router, Request, Response } from 'express';
import { readCatalog } from '../services/catalog-service.js';

const router = Router();

const CUBE_API_URL = process.env.CUBE_API_URL || 'http://localhost:4000/cubejs-api/v1';
const CUBE_JWT_SECRET = process.env.CUBE_JWT_SECRET || 'your-super-secret-key-min-32-chars';

interface CubeQuery {
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
  order?: Record<string, 'asc' | 'desc'> | Array<[string, 'asc' | 'desc']>;
  limit?: number;
  offset?: number;
}

async function generateToken(): Promise<string> {
  try {
    const jwt = await import('jsonwebtoken');
    return jwt.default.sign({}, CUBE_JWT_SECRET, { expiresIn: '1h' });
  } catch {
    // Fallback for when jsonwebtoken isn't available
    return Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
  }
}

// POST /api/query/validate - Validate query against rules
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const query = req.body as CubeQuery;
    const catalog = await readCatalog();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if limit is provided
    if (!query.limit) {
      errors.push('Query must include a limit');
    } else if (query.limit > 1000) {
      errors.push('Limit cannot exceed 1000');
    }

    // Check for required measures or dimensions
    if ((!query.measures || query.measures.length === 0) && (!query.dimensions || query.dimensions.length === 0)) {
      errors.push('Query must include at least one measure or dimension');
    }

    // Check members against catalog
    const allMembers = [
      ...(query.measures || []),
      ...(query.dimensions || []),
      ...(query.segments || []),
      ...(query.timeDimensions?.map((td) => td.dimension) || []),
      ...(query.filters?.map((f) => f.member) || []),
    ];

    const defaults = catalog.defaults || { exposed: true, pii: false };

    for (const member of allMembers) {
      const override = catalog.members?.[member];
      const exposed = override?.exposed ?? defaults.exposed ?? true;
      const pii = override?.pii ?? defaults.pii ?? false;

      if (!exposed) {
        errors.push(`Member "${member}" is not exposed`);
      }

      if (pii) {
        errors.push(`Member "${member}" is marked as PII and cannot be queried`);
      }

      // Check group-by restrictions for measures
      if (query.measures?.includes(member) && override) {
        const dimensions = [
          ...(query.dimensions || []),
          ...(query.timeDimensions?.map((td) => td.dimension) || []),
        ];

        if (override.allowedGroupBy && override.allowedGroupBy.length > 0) {
          const disallowed = dimensions.filter((d) => !override.allowedGroupBy!.includes(d));
          if (disallowed.length > 0) {
            errors.push(`Measure "${member}" can only be grouped by: ${override.allowedGroupBy.join(', ')}`);
          }
        }

        if (override.deniedGroupBy && override.deniedGroupBy.length > 0) {
          const denied = dimensions.filter((d) => override.deniedGroupBy!.includes(d));
          if (denied.length > 0) {
            errors.push(`Measure "${member}" cannot be grouped by: ${denied.join(', ')}`);
          }
        }

        if (override.requiresTimeDimension && (!query.timeDimensions || query.timeDimensions.length === 0)) {
          errors.push(`Measure "${member}" requires a time dimension`);
        }
      }
    }

    // Add warnings for potentially expensive queries
    if ((query.dimensions?.length || 0) > 5) {
      warnings.push('Query has many dimensions which may be slow');
    }

    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
    });
  } catch (error) {
    console.error('Error validating query:', error);
    res.status(500).json({ error: 'Failed to validate query' });
  }
});

// POST /api/query/execute - Execute query, return results
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const query = req.body as CubeQuery;

    // Ensure limit is set
    if (!query.limit) {
      query.limit = 100;
    }

    const token = await generateToken();
    const params = new URLSearchParams({ query: JSON.stringify(query) });

    const response = await fetch(`${CUBE_API_URL}/load?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cube API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('Error executing query:', error);
    const message = error instanceof Error ? error.message : 'Failed to execute query';
    res.status(500).json({ error: message });
  }
});

// POST /api/query/sql - Get generated SQL
router.post('/sql', async (req: Request, res: Response) => {
  try {
    const query = req.body as CubeQuery;

    // Ensure limit is set
    if (!query.limit) {
      query.limit = 100;
    }

    const token = await generateToken();
    const params = new URLSearchParams({ query: JSON.stringify(query) });

    const response = await fetch(`${CUBE_API_URL}/sql?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cube API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('Error getting SQL:', error);
    const message = error instanceof Error ? error.message : 'Failed to get SQL';
    res.status(500).json({ error: message });
  }
});

export default router;
