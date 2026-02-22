import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../../config.js', () => {
  let dataDir = '/tmp';
  return {
    getConfig: () => ({
      DATA_DIR: dataDir,
      LOG_LEVEL: 'silent',
    }),
    __setDataDir: (dir: string) => { dataDir = dir; },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __setDataDir } = await import('../../config.js') as any;

import { TenantStore } from '../tenant-store.js';

describe('TenantStore', () => {
  let tmpDir: string;
  let store: TenantStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dbmcp-tenant-test-'));
    __setDataDir(tmpDir);
    store = new TenantStore(join(tmpDir, 'config.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a tenant and retrieves by id', () => {
    const tenant = store.create('org_123', 'acme');
    expect(tenant.id).toBe('org_123');
    expect(tenant.slug).toBe('acme');
    expect(tenant.name).toBeNull();

    const found = store.getById('org_123');
    expect(found).not.toBeNull();
    expect(found!.slug).toBe('acme');
  });

  it('creates a tenant with name', () => {
    const tenant = store.create('org_123', 'acme', 'Acme Corp');
    expect(tenant.name).toBe('Acme Corp');
  });

  it('retrieves by slug', () => {
    store.create('org_123', 'acme');
    const found = store.getBySlug('acme');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('org_123');
  });

  it('returns null for non-existent id', () => {
    expect(store.getById('nonexistent')).toBeNull();
  });

  it('returns null for non-existent slug', () => {
    expect(store.getBySlug('nonexistent')).toBeNull();
  });

  it('enforces slug uniqueness', () => {
    store.create('org_1', 'acme');
    expect(() => store.create('org_2', 'acme')).toThrow();
  });

  it('enforces slug validation on create', () => {
    expect(() => store.create('org_1', 'AB')).toThrow(/Invalid slug/);
    expect(() => store.create('org_1', '1abc')).toThrow(/Invalid slug/);
  });

  it('checks slug existence', () => {
    store.create('org_1', 'acme');
    expect(store.slugExists('acme')).toBe(true);
    expect(store.slugExists('other')).toBe(false);
  });

  it('updates slug', () => {
    store.create('org_1', 'acme');
    const updated = store.updateSlug('org_1', 'acme-inc');
    expect(updated).not.toBeNull();
    expect(updated!.slug).toBe('acme-inc');

    // Old slug should not be found
    expect(store.getBySlug('acme')).toBeNull();
    // New slug should be found
    expect(store.getBySlug('acme-inc')).not.toBeNull();
  });

  it('updateSlug validates new slug', () => {
    store.create('org_1', 'acme');
    expect(() => store.updateSlug('org_1', 'AB')).toThrow(/Invalid slug/);
  });

  it('updateSlug returns null for non-existent tenant', () => {
    expect(store.updateSlug('nonexistent', 'acme')).toBeNull();
  });
});
