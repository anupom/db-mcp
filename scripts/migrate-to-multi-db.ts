#!/usr/bin/env npx tsx
/**
 * Migration Script: Single Database to Multi-Database
 *
 * This script migrates an existing db-mcp installation to the multi-database architecture.
 *
 * What it does:
 * 1. Creates the data/databases/default/ directory structure
 * 2. Copies existing agent_catalog.yaml to data/databases/default/
 * 3. Copies existing cube/model/cubes/ to data/databases/default/cube/model/cubes/
 * 4. Initializes the SQLite registry with a default database entry
 *
 * Usage:
 *   npx tsx scripts/migrate-to-multi-db.ts [--dry-run]
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');

function log(message: string) {
  console.log(`[migrate] ${message}`);
}

function logDry(message: string) {
  if (DRY_RUN) {
    console.log(`[dry-run] Would: ${message}`);
  } else {
    log(message);
  }
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    logDry(`Create directory: ${path}`);
    if (!DRY_RUN) {
      mkdirSync(path, { recursive: true });
    }
  }
}

function copyFile(src: string, dest: string) {
  if (existsSync(src)) {
    logDry(`Copy file: ${src} -> ${dest}`);
    if (!DRY_RUN) {
      ensureDir(dirname(dest));
      copyFileSync(src, dest);
    }
    return true;
  }
  return false;
}

function copyDir(src: string, dest: string) {
  if (!existsSync(src)) {
    return false;
  }

  ensureDir(dest);

  const entries = readdirSync(src);
  let copied = 0;

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
      copied++;
    }
  }

  return copied > 0;
}

async function main() {
  log('=== Multi-Database Migration Script ===');
  log(`Root directory: ${ROOT_DIR}`);
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  log('');

  // Define paths
  const dataDir = join(ROOT_DIR, 'data');
  const defaultDbDir = join(dataDir, 'databases', 'default');
  const existingCatalog = join(ROOT_DIR, 'agent_catalog.yaml');
  const existingCubeModel = join(ROOT_DIR, 'cube', 'model', 'cubes');

  // Step 1: Create directory structure
  log('Step 1: Creating directory structure...');
  ensureDir(join(defaultDbDir, 'cube', 'model', 'cubes'));

  // Step 2: Copy agent_catalog.yaml
  log('Step 2: Migrating agent_catalog.yaml...');
  const catalogDest = join(defaultDbDir, 'agent_catalog.yaml');
  if (existsSync(catalogDest)) {
    log('  Skipped: agent_catalog.yaml already exists in destination');
  } else if (copyFile(existingCatalog, catalogDest)) {
    log('  Copied agent_catalog.yaml to default database');
  } else {
    log('  No existing agent_catalog.yaml found (will use defaults)');
  }

  // Step 3: Copy cube models
  log('Step 3: Migrating cube models...');
  const cubeModelDest = join(defaultDbDir, 'cube', 'model', 'cubes');
  if (existsSync(cubeModelDest) && readdirSync(cubeModelDest).length > 0) {
    log('  Skipped: Cube models already exist in destination');
  } else if (copyDir(existingCubeModel, cubeModelDest)) {
    log('  Copied cube models to default database');
  } else {
    log('  No existing cube models found (will need to generate)');
  }

  // Step 4: Initialize database registry
  log('Step 4: Initializing database registry...');
  if (DRY_RUN) {
    logDry('Initialize SQLite database and create default entry');
  } else {
    try {
      // Dynamic import to avoid issues if dependencies not installed
      const { getDatabaseManager } = await import('../src/registry/manager.js');
      const manager = getDatabaseManager();
      await manager.initializeDefaultDatabase();
      log('  Default database initialized and activated');
    } catch (err) {
      log(`  Error initializing registry: ${(err as Error).message}`);
      log('  You may need to run the app once to initialize the database');
    }
  }

  log('');
  log('=== Migration Complete ===');
  log('');
  log('Next steps:');
  log('1. Ensure environment variables are set (CUBE_JWT_SECRET, etc.)');
  log('2. Start the application: npm run dev');
  log('3. Access the admin UI at http://localhost:3001');
  log('4. The default database should be visible and active');
  log('');
  log('MCP clients can now connect to:');
  log('  - /mcp (legacy, uses default database)');
  log('  - /mcp/default (explicit default database)');
  log('  - /mcp/:databaseId (other databases)');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
