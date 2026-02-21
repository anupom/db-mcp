import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as crypto from 'crypto';

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

import { ApiKeyStore } from '../api-key-store.js';

describe('ApiKeyStore', () => {
  let tmpDir: string;
  let store: ApiKeyStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dbmcp-apikey-test-'));
    __setDataDir(tmpDir);
    store = new ApiKeyStore(join(tmpDir, 'config.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates an API key and returns the raw key once', () => {
    const { apiKey, rawKey } = store.create('tenant-a', 'My Key', 'user-1');

    expect(apiKey.id).toBeDefined();
    expect(apiKey.tenantId).toBe('tenant-a');
    expect(apiKey.name).toBe('My Key');
    expect(apiKey.createdBy).toBe('user-1');
    expect(apiKey.revokedAt).toBeNull();
    expect(rawKey).toMatch(/^dbmcp_/);
    expect(apiKey.keyPrefix).toBe(rawKey.substring(0, 12));
  });

  it('looks up a key by its SHA-256 hash', () => {
    const { rawKey } = store.create('tenant-a', 'Test Key', 'user-1');
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const found = store.getByHash(hash);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test Key');
    expect(found!.tenantId).toBe('tenant-a');
  });

  it('returns null for unknown hash', () => {
    const found = store.getByHash('nonexistent-hash');
    expect(found).toBeNull();
  });

  it('lists keys by tenant', () => {
    store.create('tenant-a', 'Key 1', 'user-1');
    store.create('tenant-a', 'Key 2', 'user-1');
    store.create('tenant-b', 'Key 3', 'user-2');

    const tenantAKeys = store.listByTenant('tenant-a');
    expect(tenantAKeys).toHaveLength(2);
    expect(tenantAKeys.every(k => k.tenantId === 'tenant-a')).toBe(true);

    const tenantBKeys = store.listByTenant('tenant-b');
    expect(tenantBKeys).toHaveLength(1);
    expect(tenantBKeys[0].name).toBe('Key 3');
  });

  it('revokes a key', () => {
    const { apiKey, rawKey } = store.create('tenant-a', 'Revocable', 'user-1');

    const revoked = store.revoke(apiKey.id, 'tenant-a');
    expect(revoked).toBe(true);

    // Revoked key should not be found by hash
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const found = store.getByHash(hash);
    expect(found).toBeNull();

    // But it should still show in the list (with revokedAt set)
    const keys = store.listByTenant('tenant-a');
    expect(keys).toHaveLength(1);
    expect(keys[0].revokedAt).not.toBeNull();
  });

  it('revoke fails for wrong tenant', () => {
    const { apiKey } = store.create('tenant-a', 'Key', 'user-1');
    const revoked = store.revoke(apiKey.id, 'tenant-b');
    expect(revoked).toBe(false);
  });

  it('revoke fails for already-revoked key', () => {
    const { apiKey } = store.create('tenant-a', 'Key', 'user-1');
    store.revoke(apiKey.id, 'tenant-a');
    const secondRevoke = store.revoke(apiKey.id, 'tenant-a');
    expect(secondRevoke).toBe(false);
  });

  it('touches lastUsedAt', () => {
    const { apiKey, rawKey } = store.create('tenant-a', 'Key', 'user-1');
    expect(apiKey.lastUsedAt).toBeNull();

    store.touchLastUsed(apiKey.id);

    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const found = store.getByHash(hash);
    expect(found!.lastUsedAt).not.toBeNull();
  });

  it('generates unique keys', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const { rawKey } = store.create('tenant-a', `Key ${i}`, 'user-1');
      keys.add(rawKey);
    }
    expect(keys.size).toBe(10);
  });
});
