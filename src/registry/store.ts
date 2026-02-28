/**
 * Re-export from pg-store.ts — PostgreSQL is now the source of truth.
 * This file exists for backward compatibility of import paths.
 */
export { DatabaseStore, getDatabaseStore, resetDatabaseStore, initializeDatabaseStore } from './pg-store.js';
