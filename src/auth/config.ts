import { getConfig } from '../config.js';

/**
 * Returns true when both Clerk env vars are set, enabling SaaS auth mode.
 * When false, the app runs in self-hosted mode with no authentication.
 */
export function isAuthEnabled(): boolean {
  const config = getConfig();
  return !!(config.CLERK_SECRET_KEY && config.CLERK_PUBLISHABLE_KEY);
}
