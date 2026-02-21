import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabaseManager } from '../../registry/manager.js';

const router = Router();

// Input validation schemas
const CreateDatabaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ID must be URL-safe lowercase alphanumeric with hyphens'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  connection: z.object({
    type: z.enum(['postgres', 'mysql', 'bigquery', 'snowflake', 'redshift', 'clickhouse']),
    host: z.string().optional(),
    port: z.number().int().positive().optional(),
    database: z.string().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    projectId: z.string().optional(),
    account: z.string().optional(),
    warehouse: z.string().optional(),
    ssl: z.boolean().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
  cubeApiUrl: z.string().url().optional(),
  jwtSecret: z.string().min(32).optional(),
  maxLimit: z.number().int().positive().optional(),
  denyMembers: z.array(z.string()).optional(),
  defaultSegments: z.array(z.string()).optional(),
  returnSql: z.boolean().optional(),
});

const UpdateDatabaseSchema = CreateDatabaseSchema.partial().omit({ id: true });

// GET /api/databases - List all databases
router.get('/', async (req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    const tenantId = req.tenant?.tenantId;
    const databases = manager.listDatabases(tenantId);
    res.json({ databases });
  } catch (error) {
    console.error('Error listing databases:', error);
    const message = error instanceof Error ? error.message : 'Failed to list databases';
    res.status(500).json({ error: message });
  }
});

// POST /api/databases - Create a new database
router.post('/', async (req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    const tenantId = req.tenant?.tenantId;
    const input = CreateDatabaseSchema.parse(req.body);
    // Add defaults for required fields
    const createInput = {
      ...input,
      maxLimit: input.maxLimit ?? 1000,
      denyMembers: input.denyMembers ?? [],
      defaultSegments: input.defaultSegments ?? [],
      returnSql: input.returnSql ?? false,
    };
    const database = await manager.createDatabase(createInput, tenantId);
    res.status(201).json({ database });
  } catch (error) {
    console.error('Error creating database:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to create database';
    res.status(400).json({ error: message });
  }
});

// GET /api/databases/:id - Get database details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    const { id } = req.params;
    const tenantId = req.tenant?.tenantId;
    const database = manager.getDatabase(id, tenantId);

    if (!database) {
      res.status(404).json({ error: `Database '${id}' not found` });
      return;
    }

    // Don't expose sensitive fields in the response
    const safeDatabase = {
      ...database,
      connection: {
        ...database.connection,
        password: database.connection.password ? '********' : undefined,
      },
      jwtSecret: database.jwtSecret ? '********' : undefined,
    };

    res.json({ database: safeDatabase });
  } catch (error) {
    console.error('Error getting database:', error);
    const message = error instanceof Error ? error.message : 'Failed to get database';
    res.status(500).json({ error: message });
  }
});

// PUT /api/databases/:id - Update database
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    const { id } = req.params;
    const tenantId = req.tenant?.tenantId;
    const input = UpdateDatabaseSchema.parse(req.body);
    const database = await manager.updateDatabase({ id, ...input }, tenantId);

    if (!database) {
      res.status(404).json({ error: `Database '${id}' not found` });
      return;
    }

    res.json({ database });
  } catch (error) {
    console.error('Error updating database:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to update database';
    res.status(400).json({ error: message });
  }
});

// DELETE /api/databases/:id - Delete database
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    const { id } = req.params;
    const tenantId = req.tenant?.tenantId;
    const deleted = await manager.deleteDatabase(id, tenantId);

    if (!deleted) {
      res.status(404).json({ error: `Database '${id}' not found` });
      return;
    }

    res.json({ success: true, message: `Database '${id}' deleted` });
  } catch (error) {
    console.error('Error deleting database:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete database';
    res.status(400).json({ error: message });
  }
});

// POST /api/databases/:id/test - Test database connection
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    const { id } = req.params;
    const tenantId = req.tenant?.tenantId;

    // Verify ownership first
    const db = manager.getDatabase(id, tenantId);
    if (!db) {
      res.status(404).json({ success: false, message: `Database '${id}' not found` });
      return;
    }

    const result = await manager.testConnection(id, tenantId);
    res.json(result);
  } catch (error) {
    console.error('Error testing connection:', error);
    const message = error instanceof Error ? error.message : 'Failed to test connection';
    res.status(500).json({ success: false, message });
  }
});

// POST /api/databases/:id/activate - Activate database
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    const { id } = req.params;
    const tenantId = req.tenant?.tenantId;
    await manager.activateDatabase(id, tenantId);
    res.json({
      success: true,
      message: `Database '${id}' activated`,
    });
  } catch (error) {
    console.error('Error activating database:', error);
    const message = error instanceof Error ? error.message : 'Failed to activate database';
    res.status(400).json({ error: message });
  }
});

// POST /api/databases/:id/deactivate - Deactivate database
router.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    const { id } = req.params;
    const tenantId = req.tenant?.tenantId;
    await manager.deactivateDatabase(id, tenantId);
    res.json({
      success: true,
      message: `Database '${id}' deactivated`,
    });
  } catch (error) {
    console.error('Error deactivating database:', error);
    const message = error instanceof Error ? error.message : 'Failed to deactivate database';
    res.status(400).json({ error: message });
  }
});

// POST /api/databases/initialize-default - Initialize default database
router.post('/initialize-default', async (_req: Request, res: Response) => {
  try {
    const manager = getDatabaseManager();
    if (!manager) {
      res.status(503).json({ error: 'Registry not initialized' });
      return;
    }

    await manager.initializeDefaultDatabase();
    res.json({ success: true, message: 'Default database initialized' });
  } catch (error) {
    console.error('Error initializing default database:', error);
    const message = error instanceof Error ? error.message : 'Failed to initialize default database';
    res.status(500).json({ error: message });
  }
});

export default router;
