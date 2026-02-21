import { Request, Response, NextFunction, RequestHandler } from 'express';
import * as crypto from 'crypto';
import { isAuthEnabled } from './config.js';
import { getApiKeyStore } from './api-key-store.js';
import { getDatabaseManager } from '../registry/manager.js';
import type { TenantContext } from './types.js';

/**
 * Validate MCP API key for programmatic access to /mcp/:databaseId endpoints.
 * When auth is disabled: passthrough.
 * When auth is enabled: extracts Bearer token, validates against api_keys table,
 * verifies the key's tenant owns the requested database, attaches req.tenant.
 */
export function validateMcpApiKey(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthEnabled()) {
      req.tenant = { tenantId: undefined };
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
    const apiKey = store.getByHash(keyHash);

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

    // Verify the key's tenant owns the requested database
    const databaseId = req.params.databaseId;
    if (databaseId) {
      const manager = getDatabaseManager();
      const db = manager.getDatabase(databaseId, apiKey.tenantId);
      if (!db) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: `Database '${databaseId}' not found` },
          id: null,
        });
        return;
      }
    }

    // Touch last used (fire-and-forget)
    store.touchLastUsed(apiKey.id);

    const tenant: TenantContext = {
      tenantId: apiKey.tenantId,
      userId: apiKey.createdBy,
    };
    req.tenant = tenant;
    next();
  };
}
