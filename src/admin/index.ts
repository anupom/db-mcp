import { Router } from 'express';
import databaseRoutes from './routes/database.js';
import databasesRoutes from './routes/databases.js';
import cubesRoutes from './routes/cubes.js';
import catalogRoutes from './routes/catalog.js';
import queryRoutes from './routes/query.js';
import chatRoutes from './routes/chat.js';
import mcpRoutes from './routes/mcp.js';
import apiKeysRoutes from './routes/api-keys.js';
import tenantRoutes from './routes/tenant.js';
import { healthCheck } from './services/postgres.js';
import { isAuthEnabled } from '../auth/config.js';
import { getConfig } from '../config.js';
import { requireTenant, ensureTenant } from '../auth/middleware.js';

const router = Router();

// Public endpoint — frontend needs this before Clerk initializes
router.get('/config', (_req, res) => {
  const config = getConfig();
  res.json({
    authEnabled: isAuthEnabled(),
    clerkPublishableKey: config.CLERK_PUBLISHABLE_KEY || null,
  });
});

// Root endpoint - show available APIs
router.get('/', (_req, res) => {
  res.json({
    name: 'DB-MCP Admin API',
    version: '1.0.0',
    endpoints: {
      config: '/api/config',
      databases: '/api/databases',
      database: '/api/database',
      cubes: '/api/cubes',
      catalog: '/api/catalog',
      query: '/api/query',
      chat: '/api/chat',
      mcp: '/api/mcp',
      apiKeys: '/api/api-keys',
      tenant: '/api/tenant',
    },
  });
});

// Gate all routes below with tenant auth
router.use(requireTenant());
router.use(ensureTenant());

// Tenant routes (only useful when auth is enabled)
router.use('/tenant', tenantRoutes);

// API Routes
router.use('/database', databaseRoutes);
router.use('/databases', databasesRoutes);
router.use('/cubes', cubesRoutes);
router.use('/catalog', catalogRoutes);
router.use('/query', queryRoutes);
router.use('/chat', chatRoutes);
router.use('/mcp', mcpRoutes);
router.use('/api-keys', apiKeysRoutes);

export { healthCheck };
export default router;
