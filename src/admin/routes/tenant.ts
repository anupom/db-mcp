import { Router, Request, Response } from 'express';
import { getTenantStore } from '../../auth/tenant-store.js';
import { isValidSlug } from '../../auth/tenant-slug.js';
import { requireOrgAdmin } from '../../auth/middleware.js';

const router = Router();

/**
 * GET /api/tenant — returns current tenant info (tenantId, slug, name)
 */
router.get('/', async (req: Request, res: Response) => {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    res.status(400).json({ error: 'Tenant context required' });
    return;
  }

  const store = getTenantStore();
  const tenant = await store.getById(tenantId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  res.json({
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
  });
});

/**
 * PUT /api/tenant/slug — update tenant slug (requires org admin)
 */
router.put('/slug', requireOrgAdmin(), async (req: Request, res: Response) => {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    res.status(400).json({ error: 'Tenant context required' });
    return;
  }

  const { slug } = req.body as { slug?: string };
  if (!slug || typeof slug !== 'string') {
    res.status(400).json({ error: 'slug is required' });
    return;
  }

  if (!isValidSlug(slug)) {
    res.status(400).json({
      error: 'Invalid slug. Must be 3-48 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens.',
    });
    return;
  }

  const store = getTenantStore();

  // Check uniqueness (not taken by another tenant)
  const existing = await store.getBySlug(slug);
  if (existing && existing.id !== tenantId) {
    res.status(409).json({ error: 'Slug is already taken' });
    return;
  }

  try {
    const tenant = await store.updateSlug(tenantId, slug);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    res.json({
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    });
  } catch (err) {
    // UNIQUE constraint race: another request took this slug between our check and update
    if (err instanceof Error && (err.message.includes('UNIQUE constraint') || err.message.includes('duplicate key'))) {
      res.status(409).json({ error: 'Slug is already taken' });
      return;
    }
    throw err;
  }
});

export default router;
