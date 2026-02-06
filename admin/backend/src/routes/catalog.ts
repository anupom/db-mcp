import { Router, Request, Response } from 'express';
import {
  readCatalog,
  updateMember,
  updateDefaults,
  removeMemberOverride,
  mergeWithCubeMeta,
  type CatalogOverride,
} from '../services/catalog-service.js';
import { getCubeApiMeta } from '../services/cube-generator.js';

const router = Router();

const CUBE_API_URL = process.env.CUBE_API_URL || 'http://localhost:4000/cubejs-api/v1';
const CUBE_JWT_SECRET = process.env.CUBE_JWT_SECRET || 'your-super-secret-key-min-32-chars';

// GET /api/catalog/members - All members with governance status
router.get('/members', async (_req: Request, res: Response) => {
  try {
    const [catalog, cubeMeta] = await Promise.all([
      readCatalog(),
      getCubeApiMeta(CUBE_API_URL, CUBE_JWT_SECRET).catch(() => ({ cubes: [] })),
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
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// GET /api/catalog - Raw catalog config
router.get('/', async (_req: Request, res: Response) => {
  try {
    const catalog = await readCatalog();
    res.json(catalog);
  } catch (error) {
    console.error('Error reading catalog:', error);
    res.status(500).json({ error: 'Failed to read catalog' });
  }
});

// PUT /api/catalog/members/:name - Update member governance
router.put('/members/:name', async (req: Request, res: Response) => {
  try {
    const memberName = req.params.name;
    const override = req.body as CatalogOverride;

    const catalog = await updateMember(memberName, override);
    res.json({ success: true, catalog });
  } catch (error) {
    console.error('Error updating member:', error);
    const message = error instanceof Error ? error.message : 'Failed to update member';
    res.status(400).json({ error: message });
  }
});

// DELETE /api/catalog/members/:name - Remove member override
router.delete('/members/:name', async (req: Request, res: Response) => {
  try {
    const memberName = req.params.name;
    const catalog = await removeMemberOverride(memberName);
    res.json({ success: true, catalog });
  } catch (error) {
    console.error('Error removing member override:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove member override';
    res.status(400).json({ error: message });
  }
});

// PUT /api/catalog/defaults - Update default settings
router.put('/defaults', async (req: Request, res: Response) => {
  try {
    const defaults = req.body as { exposed?: boolean; pii?: boolean };
    const catalog = await updateDefaults(defaults);
    res.json({ success: true, catalog });
  } catch (error) {
    console.error('Error updating defaults:', error);
    const message = error instanceof Error ? error.message : 'Failed to update defaults';
    res.status(400).json({ error: message });
  }
});

export default router;
