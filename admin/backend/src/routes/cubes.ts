import { Router, Request, Response } from 'express';
import {
  generateCubeYaml,
  listCubeFiles,
  readCubeFile,
  writeCubeFile,
  createCubeFile,
  getCubeApiMeta,
  type CubeConfig,
} from '../services/cube-generator.js';

const router = Router();

const CUBE_API_URL = process.env.CUBE_API_URL || 'http://localhost:4000/cubejs-api/v1';
const CUBE_JWT_SECRET = process.env.CUBE_JWT_SECRET || 'your-super-secret-key-min-32-chars';

// GET /api/cubes - List cubes from Cube /meta
router.get('/', async (_req: Request, res: Response) => {
  try {
    const meta = await getCubeApiMeta(CUBE_API_URL, CUBE_JWT_SECRET);
    res.json(meta);
  } catch (error) {
    console.error('Error fetching Cube meta:', error);
    res.status(500).json({ error: 'Failed to fetch Cube metadata' });
  }
});

// POST /api/cubes/generate - Generate YAML from table config
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const config = req.body as CubeConfig;

    if (!config.name || !config.sql_table) {
      res.status(400).json({ error: 'name and sql_table are required' });
      return;
    }

    const yamlContent = generateCubeYaml(config);
    res.json({ yaml: yamlContent });
  } catch (error) {
    console.error('Error generating YAML:', error);
    res.status(500).json({ error: 'Failed to generate YAML' });
  }
});

// GET /api/cubes/files - List cube YAML files
router.get('/files', async (_req: Request, res: Response) => {
  try {
    const files = await listCubeFiles();
    res.json({ files });
  } catch (error) {
    console.error('Error listing cube files:', error);
    res.status(500).json({ error: 'Failed to list cube files' });
  }
});

// GET /api/cubes/files/:name - Read cube YAML file
router.get('/files/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const file = await readCubeFile(name);
    res.json(file);
  } catch (error) {
    console.error('Error reading cube file:', error);
    const message = error instanceof Error ? error.message : 'Failed to read cube file';
    res.status(404).json({ error: message });
  }
});

// PUT /api/cubes/files/:name - Update cube YAML
router.put('/files/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { content } = req.body as { content: string };

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    await writeCubeFile(name, content);
    res.json({ success: true, message: `Updated ${name}.yml` });
  } catch (error) {
    console.error('Error updating cube file:', error);
    const message = error instanceof Error ? error.message : 'Failed to update cube file';
    res.status(400).json({ error: message });
  }
});

// POST /api/cubes/files - Create new cube YAML
router.post('/files', async (req: Request, res: Response) => {
  try {
    const { fileName, config } = req.body as { fileName: string; config: CubeConfig };

    if (!fileName || !config) {
      res.status(400).json({ error: 'fileName and config are required' });
      return;
    }

    const content = await createCubeFile(fileName, config);
    res.json({ success: true, content, message: `Created ${fileName}.yml` });
  } catch (error) {
    console.error('Error creating cube file:', error);
    const message = error instanceof Error ? error.message : 'Failed to create cube file';
    res.status(400).json({ error: message });
  }
});

export default router;
