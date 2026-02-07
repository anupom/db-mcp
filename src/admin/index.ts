import { Router } from 'express';
import databaseRoutes from './routes/database.js';
import databasesRoutes from './routes/databases.js';
import cubesRoutes from './routes/cubes.js';
import catalogRoutes from './routes/catalog.js';
import queryRoutes from './routes/query.js';
import chatRoutes from './routes/chat.js';
import mcpRoutes from './routes/mcp.js';
import { healthCheck } from './services/postgres.js';

const router = Router();

// Root endpoint - show available APIs
router.get('/', (_req, res) => {
  res.json({
    name: 'DB-MCP Admin API',
    version: '1.0.0',
    endpoints: {
      databases: '/api/databases',
      database: '/api/database',
      cubes: '/api/cubes',
      catalog: '/api/catalog',
      query: '/api/query',
      chat: '/api/chat',
      mcp: '/api/mcp',
    },
  });
});

// API Routes
router.use('/database', databaseRoutes);
router.use('/databases', databasesRoutes);
router.use('/cubes', cubesRoutes);
router.use('/catalog', catalogRoutes);
router.use('/query', queryRoutes);
router.use('/chat', chatRoutes);
router.use('/mcp', mcpRoutes);

export { healthCheck };
export default router;
