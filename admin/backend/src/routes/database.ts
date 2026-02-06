import { Router, Request, Response } from 'express';
import { getTables, getTableDetails, getSampleData } from '../services/postgres.js';

const router = Router();

// GET /api/database/tables - List all tables with columns
router.get('/tables', async (_req: Request, res: Response) => {
  try {
    const tables = await getTables();
    res.json({ tables });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// GET /api/database/tables/:name - Table details with suggested measures/dimensions
router.get('/tables/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const details = await getTableDetails(name);
    res.json(details);
  } catch (error) {
    console.error('Error fetching table details:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch table details';
    res.status(404).json({ error: message });
  }
});

// GET /api/database/tables/:name/sample - Sample data (10 rows)
router.get('/tables/:name/sample', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await getSampleData(name, Math.min(limit, 100));
    res.json({ data, count: data.length });
  } catch (error) {
    console.error('Error fetching sample data:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch sample data';
    res.status(404).json({ error: message });
  }
});

export default router;
