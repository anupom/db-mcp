import * as crypto from 'crypto';

/**
 * Process-local secret used for internal server-to-server requests
 * (e.g., chat route → MCP endpoint). Generated once at startup.
 */
const INTERNAL_SECRET = crypto.randomBytes(32).toString('hex');

export function getInternalSecret(): string {
  return INTERNAL_SECRET;
}
