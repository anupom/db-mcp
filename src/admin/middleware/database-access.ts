import { Request, Response } from 'express';
import { getDatabaseManager, defaultDatabaseId } from '../../registry/manager.js';

/**
 * Verify the caller owns the requested database.
 * Returns the databaseId if valid, or sends an error response and returns null.
 *
 * In self-hosted mode (tenantId undefined), returns the raw query param or 'default'.
 * In SaaS mode, falls back to the tenant's scoped default ID when ?database= is omitted.
 */
export function verifyDatabaseAccess(req: Request, res: Response): string | null {
  const tenantId = req.tenant?.tenantId;
  const databaseId = (req.query.database as string) || defaultDatabaseId(tenantId);

  if (tenantId !== undefined) {
    const manager = getDatabaseManager();
    const db = manager.getDatabase(databaseId, tenantId);
    if (!db) {
      res.status(404).json({ error: `Database '${databaseId}' not found` });
      return null;
    }
  }

  return databaseId;
}
