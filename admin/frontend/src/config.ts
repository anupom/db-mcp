// Backend origin URL.
// Empty string = same origin (dev proxy / Docker Compose nginx proxy).
// Set VITE_API_URL for cross-origin deployments (e.g. Railway).
export const BACKEND_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
