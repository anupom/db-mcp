import { Router, Request, Response } from 'express';
import {
  readCatalog,
  updateMember,
  updateDefaults,
  removeMemberOverride,
  mergeWithCubeMeta,
  getCubeApiConfig,
  type CatalogOverride,
} from '../services/catalog-service.js';
import { getCubeApiMeta } from '../services/cube-generator.js';
import { verifyDatabaseAccess } from '../middleware/database-access.js';

const router = Router();

// GET /api/catalog/members - All members with governance status
// Query param: ?database=<id> (default: "default")
router.get('/members', async (req: Request, res: Response) => {
  try {
    const databaseId = await verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const cubeConfig = await getCubeApiConfig(databaseId);
    let cubeMetaError: string | undefined;
    const [catalog, cubeMeta] = await Promise.all([
      readCatalog(databaseId),
      getCubeApiMeta(cubeConfig.cubeApiUrl, cubeConfig.jwtSecret, databaseId).catch((err) => {
        cubeMetaError = err.message;
        console.error(`Cube.js meta API error for database '${databaseId}': ${err.message}`);
        console.error(`  Cube API URL: ${cubeConfig.cubeApiUrl}/meta`);
        return { cubes: [] };
      }),
    ]);

    const members = mergeWithCubeMeta(
      cubeMeta as { cubes: Array<{ name: string; measures: unknown[]; dimensions: unknown[]; segments?: unknown[] }> },
      catalog
    );

    res.json({
      members,
      defaults: catalog.defaults,
      defaultSegments: catalog.defaultSegments,
      defaultFilters: catalog.defaultFilters,
      ...(cubeMetaError && { warning: `Cube.js meta unavailable: ${cubeMetaError}` }),
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// GET /api/catalog - Raw catalog config
// Query param: ?database=<id> (default: "default")
router.get('/', async (req: Request, res: Response) => {
  try {
    const databaseId = await verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const catalog = await readCatalog(databaseId);
    res.json(catalog);
  } catch (error) {
    console.error('Error reading catalog:', error);
    res.status(500).json({ error: 'Failed to read catalog' });
  }
});

// PUT /api/catalog/members/:name - Update member governance
// Query param: ?database=<id> (default: "default")
router.put('/members/:name', async (req: Request, res: Response) => {
  try {
    const databaseId = await verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const memberName = req.params.name;
    const override = req.body as CatalogOverride;

    const catalog = await updateMember(memberName, override, databaseId);
    res.json({ success: true, catalog });
  } catch (error) {
    console.error('Error updating member:', error);
    const message = error instanceof Error ? error.message : 'Failed to update member';
    res.status(400).json({ error: message });
  }
});

// DELETE /api/catalog/members/:name - Remove member override
// Query param: ?database=<id> (default: "default")
router.delete('/members/:name', async (req: Request, res: Response) => {
  try {
    const databaseId = await verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const memberName = req.params.name;
    const catalog = await removeMemberOverride(memberName, databaseId);
    res.json({ success: true, catalog });
  } catch (error) {
    console.error('Error removing member override:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove member override';
    res.status(400).json({ error: message });
  }
});

// PUT /api/catalog/defaults - Update default settings
// Query param: ?database=<id> (default: "default")
router.put('/defaults', async (req: Request, res: Response) => {
  try {
    const databaseId = await verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const defaults = req.body as { exposed?: boolean; pii?: boolean };
    const catalog = await updateDefaults(defaults, databaseId);
    res.json({ success: true, catalog });
  } catch (error) {
    console.error('Error updating defaults:', error);
    const message = error instanceof Error ? error.message : 'Failed to update defaults';
    res.status(400).json({ error: message });
  }
});

export default router;
