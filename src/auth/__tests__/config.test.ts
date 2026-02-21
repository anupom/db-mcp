import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock getConfig since it's a cached singleton
vi.mock('../../config.js', () => {
  let mockConfig: Record<string, unknown> = {};
  return {
    getConfig: () => mockConfig,
    loadConfig: () => mockConfig,
    __setMockConfig: (config: Record<string, unknown>) => { mockConfig = config; },
  };
});

import { isAuthEnabled } from '../config.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __setMockConfig } = await import('../../config.js') as any;

describe('isAuthEnabled', () => {
  beforeEach(() => {
    __setMockConfig({});
  });

  it('returns false when no Clerk vars are set', () => {
    __setMockConfig({
      CLERK_SECRET_KEY: undefined,
      CLERK_PUBLISHABLE_KEY: undefined,
    });
    expect(isAuthEnabled()).toBe(false);
  });

  it('returns false when only CLERK_SECRET_KEY is set', () => {
    __setMockConfig({
      CLERK_SECRET_KEY: 'sk_test_123',
      CLERK_PUBLISHABLE_KEY: undefined,
    });
    expect(isAuthEnabled()).toBe(false);
  });

  it('returns false when only CLERK_PUBLISHABLE_KEY is set', () => {
    __setMockConfig({
      CLERK_SECRET_KEY: undefined,
      CLERK_PUBLISHABLE_KEY: 'pk_test_123',
    });
    expect(isAuthEnabled()).toBe(false);
  });

  it('returns true when both Clerk vars are set', () => {
    __setMockConfig({
      CLERK_SECRET_KEY: 'sk_test_123',
      CLERK_PUBLISHABLE_KEY: 'pk_test_123',
    });
    expect(isAuthEnabled()).toBe(true);
  });

  it('returns false for empty strings', () => {
    __setMockConfig({
      CLERK_SECRET_KEY: '',
      CLERK_PUBLISHABLE_KEY: '',
    });
    expect(isAuthEnabled()).toBe(false);
  });
});
