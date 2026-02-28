import { Request, Response, NextFunction, RequestHandler } from 'express';
import * as crypto from 'crypto';
import { isAuthEnabled } from './config.js';
import { getApiKeyStore } from './api-key-store.js';
import { getTenantStore } from './tenant-store.js';
import { getDatabaseManager } from '../registry/manager.js';
import { getInternalSecret } from './internal-secret.js';
import type { TenantContext } from './types.js';

/**
 * Validate MCP API key for programmatic access to /mcp/:databaseId endpoints.
 * When auth is disabled: passthrough.
 * When auth is enabled: extracts Bearer token, validates against api_keys table,
 * verifies the key's tenant owns the requested database, attaches req.tenant.
 *
 * When tenantSlug is present in route params:
 * 1. Looks up tenant by slug to get tenantId
 * 2. Verifies API key's tenantId matches
 * 3. Verifies database ownership
 */
export function validateMcpApiKey(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthEnabled()) {
      req.tenant = { tenantId: undefined };
      return next();
    }

    // Allow internal server-to-server requests (e.g., chat → MCP)
    const internalSecret = req.headers['x-internal-secret'] as string;
    if (internalSecret && internalSecret.length === getInternalSecret().length &&
        crypto.timingSafeEqual(Buffer.from(internalSecret), Buffer.from(getInternalSecret()))) {
      // Forward the tenant context from the originating request if provided
      const forwardedTenantId = req.headers['x-tenant-id'] as string | undefined;
      req.tenant = { tenantId: forwardedTenantId };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'API key required. Provide Bearer token in Authorization header.' },
        id: null,
      });
      return;
    }

    const rawKey = authHeader.substring(7);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const store = getApiKeyStore();
    const apiKey = await store.getByHash(keyHash);

    if (!apiKey) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or revoked API key' },
        id: null,
      });
      return;
    }

    // Check expiration
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'API key has expired' },
        id: null,
      });
      return;
    }

    // When tenantSlug is present, verify it matches the API key's tenant
    const { tenantSlug } = req.params;
    if (tenantSlug) {
      const tenantStore = getTenantStore();
      const tenant = await tenantStore.getBySlug(tenantSlug);
      if (!tenant) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: `Unknown tenant: '${tenantSlug}'` },
          id: null,
        });
        return;
      }
      if (tenant.id !== apiKey.tenantId) {
        res.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'API key does not belong to this tenant' },
          id: null,
        });
        return;
      }
    }

    // Verify the key's tenant owns the requested database
    const databaseId = req.params.databaseId;
    if (databaseId) {
      const manager = getDatabaseManager();
      const db = await manager.getDatabase(databaseId, apiKey.tenantId);
      if (!db) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: `Database '${databaseId}' not found` },
          id: null,
        });
        return;
      }
    }

    // Touch last used (fire-and-forget, non-critical)
    store.touchLastUsed(apiKey.id).catch(() => { /* best-effort */ });

    const tenant: TenantContext = {
      tenantId: apiKey.tenantId,
      userId: apiKey.createdBy,
    };
    req.tenant = tenant;
    next();
  };
}
