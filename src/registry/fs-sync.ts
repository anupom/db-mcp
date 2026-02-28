import { mkdir, writeFile, rename, rm } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { getConfig } from '../config.js';
import { getDatabaseStore } from './pg-store.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ component: 'FsSync' });

/**
 * Get the data directory for a database
 */
export function getDatabaseDataDir(databaseId: string): string {
  return join(getConfig().DATA_DIR, 'databases', databaseId);
}

/**
 * Get the cube model cubes directory for a database
 */
export function getCubeModelCubesDir(databaseId: string): string {
  return join(getDatabaseDataDir(databaseId), 'cube', 'model', 'cubes');
}

/**
 * Ensure the directory structure exists for a database
 */
export async function ensureDatabaseDirs(databaseId: string): Promise<void> {
  const cubeModelDir = getCubeModelCubesDir(databaseId);
  await mkdir(cubeModelDir, { recursive: true });
}

/**
 * Sync all cube YAML files for one database from PG to disk
 */
export async function syncCubeFilesToDisk(databaseId: string): Promise<void> {
  const store = getDatabaseStore();
  const files = await store.getAllCubeFiles(databaseId);
  const cubesDir = getCubeModelCubesDir(databaseId);

  await mkdir(cubesDir, { recursive: true });

  for (const file of files) {
    const filePath = join(cubesDir, file.fileName);
    await writeFile(filePath, file.content, 'utf-8');
  }

  logger.debug({ databaseId, fileCount: files.length }, 'Synced cube files to disk');
}

/**
 * Write cube-connections.json from active databases in PG.
 * This replaces the old exportConnectionsForCube() logic.
 */
export async function syncConnectionsToDisk(): Promise<void> {
  const store = getDatabaseStore();
  const dataDir = getConfig().DATA_DIR;

  // No tenantId filter — export ALL active databases for Cube.js
  const databases = await store.listActive();

  const cubeApiUrl = getConfig().CUBE_API_URL;
  const cubeColocated = process.env.CUBE_COLOCATED === 'true';
  const cubeInDocker = !cubeColocated && /https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(cubeApiUrl);

  const connections: Record<string, Record<string, unknown>> = {};

  for (const db of databases) {
    if (db.connection) {
      let host = db.connection.host;
      if (cubeInDocker && host && /^(localhost|127\.0\.0\.1)$/.test(host)) {
        host = 'host.docker.internal';
      }

      connections[db.id] = {
        type: db.connection.type,
        host,
        port: db.connection.port,
        database: db.connection.database,
        user: db.connection.user,
        password: db.connection.password,
        ssl: db.connection.ssl,
        projectId: db.connection.projectId,
        account: db.connection.account,
        warehouse: db.connection.warehouse,
        options: db.connection.options,
      };
    }
  }

  await mkdir(dataDir, { recursive: true });
  const exportPath = join(dataDir, 'cube-connections.json');
  const tmpPath = `${exportPath}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmpPath, JSON.stringify(connections, null, 2));
  await rename(tmpPath, exportPath);
  logger.info({ path: exportPath, count: Object.keys(connections).length }, 'Exported database connections for Cube.js');
}

/**
 * Full sync: write all cube files + connections for all active databases
 * Called on startup to regenerate filesystem cache from PG.
 */
export async function syncAllToDisk(): Promise<void> {
  const store = getDatabaseStore();

  // Get ALL databases (not just active) so we sync cube files for inactive ones too
  const databases = await store.list();

  for (const db of databases) {
    await ensureDatabaseDirs(db.id);
    await syncCubeFilesToDisk(db.id);
  }

  await syncConnectionsToDisk();

  logger.info({ databaseCount: databases.length }, 'Full filesystem sync complete');
}

/**
 * Write a single cube file to disk (for Cube.js to pick up)
 */
export async function writeCubeFileToDisk(databaseId: string, fileName: string, content: string): Promise<void> {
  const cubesDir = getCubeModelCubesDir(databaseId);
  await mkdir(cubesDir, { recursive: true });
  const filePath = join(cubesDir, fileName);
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Delete a single cube file from disk
 */
export async function deleteCubeFileFromDisk(databaseId: string, fileName: string): Promise<void> {
  const cubesDir = getCubeModelCubesDir(databaseId);
  const filePath = join(cubesDir, fileName);
  try {
    await rm(filePath);
  } catch {
    // File may not exist on disk, that's fine
  }
}
