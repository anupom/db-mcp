import { Router, Request, Response } from 'express';
import { isAuthEnabled } from '../../auth/config.js';
import { getApiKeyStore } from '../../auth/api-key-store.js';
import { requireOrgAdmin } from '../../auth/middleware.js';

const router = Router();

// GET /api/api-keys - List org's API keys (never returns raw key or hash)
router.get('/', async (req: Request, res: Response) => {
  if (!isAuthEnabled()) {
    res.status(404).json({ error: 'API keys are not available in self-hosted mode' });
    return;
  }

  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const store = getApiKeyStore();
  const keys = await store.listByTenant(tenantId);
  res.json({ keys });
});

// POST /api/api-keys - Create a new API key (requires org admin)
router.post('/', requireOrgAdmin(), async (req: Request, res: Response) => {
  if (!isAuthEnabled()) {
    res.status(404).json({ error: 'API keys are not available in self-hosted mode' });
    return;
  }

  const tenantId = req.tenant?.tenantId;
  const userId = req.tenant?.userId;
  if (!tenantId || !userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (name.trim().length > 100) {
    res.status(400).json({ error: 'name must be 100 characters or fewer' });
    return;
  }

  const store = getApiKeyStore();
  const { apiKey, rawKey } = await store.create(tenantId, name.trim(), userId);
  res.status(201).json({ key: apiKey, rawKey });
});

// DELETE /api/api-keys/:id - Revoke an API key (requires org admin)
router.delete('/:id', requireOrgAdmin(), async (req: Request, res: Response) => {
  if (!isAuthEnabled()) {
    res.status(404).json({ error: 'API keys are not available in self-hosted mode' });
    return;
  }

  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { id } = req.params;
  const store = getApiKeyStore();
  const revoked = await store.revoke(id, tenantId);

  if (!revoked) {
    res.status(404).json({ error: 'API key not found or already revoked' });
    return;
  }

  res.json({ success: true, message: 'API key revoked' });
});

export default router;
