import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { getConfig } from '../config.js';
import { getLogger } from '../utils/logger.js';
import { isValidSlug } from './tenant-slug.js';

const logger = getLogger().child({ component: 'TenantStore' });

export interface Tenant {
  id: string;
  slug: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * SQLite-based tenant store for slug management.
 * Uses the same config.db as DatabaseStore and ApiKeyStore.
 */
export class TenantStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const config = getConfig();
    const dataDir = config.DATA_DIR;
    const actualPath = dbPath ?? join(dataDir, 'config.db');

    const dir = dirname(actualPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(actualPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
    logger.info({ path: actualPath }, 'Tenant store initialized');
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  getById(id: string): Tenant | null {
    const row = this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToTenant(row);
  }

  getBySlug(slug: string): Tenant | null {
    const row = this.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToTenant(row);
  }

  create(id: string, slug: string, name?: string): Tenant {
    if (!isValidSlug(slug)) {
      throw new Error(`Invalid slug: "${slug}". Must match ^[a-z][a-z0-9-]{2,47}$`);
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO tenants (id, slug, name, created_at, updated_at)
      VALUES (@id, @slug, @name, @created_at, @updated_at)
    `).run({
      id,
      slug,
      name: name ?? null,
      created_at: now,
      updated_at: now,
    });

    logger.info({ id, slug }, 'Tenant created');
    return this.getById(id)!;
  }

  updateSlug(id: string, newSlug: string): Tenant | null {
    if (!isValidSlug(newSlug)) {
      throw new Error(`Invalid slug: "${newSlug}". Must match ^[a-z][a-z0-9-]{2,47}$`);
    }

    const now = new Date().toISOString();
    const result = this.db.prepare(
      'UPDATE tenants SET slug = @slug, updated_at = @updated_at WHERE id = @id'
    ).run({ id, slug: newSlug, updated_at: now });

    if (result.changes === 0) return null;
    return this.getById(id);
  }

  slugExists(slug: string): boolean {
    return this.db.prepare('SELECT 1 FROM tenants WHERE slug = ?').get(slug) !== undefined;
  }

  private rowToTenant(row: Record<string, unknown>): Tenant {
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: (row.name as string) || null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let defaultStore: TenantStore | null = null;

export function getTenantStore(): TenantStore {
  if (!defaultStore) {
    defaultStore = new TenantStore();
  }
  return defaultStore;
}

export function resetTenantStore(): void {
  if (defaultStore) {
    defaultStore.close();
    defaultStore = null;
  }
}
