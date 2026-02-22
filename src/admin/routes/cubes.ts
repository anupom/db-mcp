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
import { enhanceCubeWithLLM } from '../services/llm-cube-enhancer.js';
import { getCubeApiConfig } from '../services/catalog-service.js';
import { verifyDatabaseAccess } from '../middleware/database-access.js';

const router = Router();

// GET /api/cubes - List cubes from Cube /meta
// Query param: ?database=<id> (default: "default")
router.get('/', async (req: Request, res: Response) => {
  try {
    const databaseId = verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const cubeConfig = await getCubeApiConfig(databaseId);
    const meta = await getCubeApiMeta(cubeConfig.cubeApiUrl, cubeConfig.jwtSecret, databaseId);
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
// Query param: ?database=<id> (default: "default")
router.get('/files', async (req: Request, res: Response) => {
  try {
    const databaseId = verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const files = await listCubeFiles(databaseId);
    res.json({ files });
  } catch (error) {
    console.error('Error listing cube files:', error);
    res.status(500).json({ error: 'Failed to list cube files' });
  }
});

// GET /api/cubes/files/:name - Read cube YAML file
// Query param: ?database=<id> (default: "default")
router.get('/files/:name', async (req: Request, res: Response) => {
  try {
    const databaseId = verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const { name } = req.params;
    const file = await readCubeFile(name, databaseId);
    res.json(file);
  } catch (error) {
    console.error('Error reading cube file:', error);
    const message = error instanceof Error ? error.message : 'Failed to read cube file';
    res.status(404).json({ error: message });
  }
});

// PUT /api/cubes/files/:name - Update cube YAML
// Query param: ?database=<id> (default: "default")
router.put('/files/:name', async (req: Request, res: Response) => {
  try {
    const databaseId = verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const { name } = req.params;
    const { content } = req.body as { content: string };

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    await writeCubeFile(name, content, databaseId);
    res.json({ success: true, message: `Updated ${name}.yml` });
  } catch (error) {
    console.error('Error updating cube file:', error);
    const message = error instanceof Error ? error.message : 'Failed to update cube file';
    res.status(400).json({ error: message });
  }
});

// POST /api/cubes/generate-enhanced - Generate LLM-enhanced cube YAML
// Query param: ?database=<id> (default: "default")
router.post('/generate-enhanced', async (req: Request, res: Response) => {
  try {
    const { tableName, initialConfig, sampleData } = req.body as {
      tableName: string;
      initialConfig: CubeConfig;
      sampleData?: Record<string, unknown>[];
    };

    if (!tableName || !initialConfig) {
      res.status(400).json({ error: 'tableName and initialConfig required' });
      return;
    }

    const enhanced = await enhanceCubeWithLLM(tableName, initialConfig, sampleData);
    const yaml = generateCubeYaml(enhanced);

    res.json({ config: enhanced, yaml });
  } catch (error) {
    console.error('LLM enhancement failed:', error);
    res.status(500).json({ error: 'Enhancement failed' });
  }
});

// POST /api/cubes/files - Create new cube YAML
// Query param: ?database=<id> (default: "default")
router.post('/files', async (req: Request, res: Response) => {
  try {
    const databaseId = verifyDatabaseAccess(req, res);
    if (!databaseId) return;

    const { fileName, config } = req.body as { fileName: string; config: CubeConfig };

    if (!fileName || !config) {
      res.status(400).json({ error: 'fileName and config are required' });
      return;
    }

    const content = await createCubeFile(fileName, config, databaseId);
    res.json({ success: true, content, message: `Created ${fileName}.yml` });
  } catch (error) {
    console.error('Error creating cube file:', error);
    const message = error instanceof Error ? error.message : 'Failed to create cube file';
    res.status(400).json({ error: message });
  }
});

export default router;
