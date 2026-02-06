import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { healthCheck } from './services/postgres.js';
import databaseRoutes from './routes/database.js';
import cubesRoutes from './routes/cubes.js';
import catalogRoutes from './routes/catalog.js';
import queryRoutes from './routes/query.js';
import chatRoutes from './routes/chat.js';
import mcpRoutes from './routes/mcp.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (_req, res) => {
  const dbHealthy = await healthCheck();
  const status = dbHealthy ? 'healthy' : 'unhealthy';
  res.status(dbHealthy ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
    },
  });
});

// API Routes
app.use('/api/database', databaseRoutes);
app.use('/api/cubes', cubesRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/mcp', mcpRoutes);

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Admin API server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Database API: http://localhost:${PORT}/api/database`);
  console.log(`   Cubes API:    http://localhost:${PORT}/api/cubes`);
  console.log(`   Catalog API:  http://localhost:${PORT}/api/catalog`);
  console.log(`   Query API:    http://localhost:${PORT}/api/query`);
  console.log(`   Chat API:     http://localhost:${PORT}/api/chat`);
  console.log(`   MCP API:      http://localhost:${PORT}/api/mcp`);
});

export default app;
