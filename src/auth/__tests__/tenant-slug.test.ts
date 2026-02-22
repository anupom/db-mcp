import { describe, it, expect } from 'vitest';
import { isValidSlug, generateSlug, generateUniqueSlug } from '../tenant-slug.js';

describe('isValidSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('org-abc123')).toBe(true);
    expect(isValidSlug('my-company')).toBe(true);
    expect(isValidSlug('a'.repeat(48))).toBe(true);
  });

  it('rejects slugs starting with a number', () => {
    expect(isValidSlug('1abc')).toBe(false);
  });

  it('rejects slugs starting with a hyphen', () => {
    expect(isValidSlug('-abc')).toBe(false);
  });

  it('rejects slugs with uppercase', () => {
    expect(isValidSlug('Abc')).toBe(false);
  });

  it('rejects slugs that are too short', () => {
    expect(isValidSlug('ab')).toBe(false);
  });

  it('rejects slugs that are too long', () => {
    expect(isValidSlug('a'.repeat(49))).toBe(false);
  });

  it('rejects slugs with special characters', () => {
    expect(isValidSlug('abc_def')).toBe(false);
    expect(isValidSlug('abc.def')).toBe(false);
    expect(isValidSlug('abc def')).toBe(false);
  });
});

describe('generateSlug', () => {
  it('converts org_abc123 to org-abc123', () => {
    expect(generateSlug('org_abc123')).toBe('org-abc123');
  });

  it('lowercases the input', () => {
    expect(generateSlug('org_ABC')).toBe('org-abc');
  });

  it('collapses multiple hyphens', () => {
    expect(generateSlug('org__abc')).toBe('org-abc');
  });

  it('prefixes with org- if starts with number', () => {
    expect(generateSlug('123abc')).toBe('org-123abc');
  });

  it('truncates to 48 chars', () => {
    const long = 'org-' + 'a'.repeat(100);
    expect(generateSlug(long).length).toBeLessThanOrEqual(48);
  });
});

describe('generateUniqueSlug', () => {
  it('returns base slug when no collision', () => {
    const slug = generateUniqueSlug('org_acme', () => false);
    expect(slug).toBe('org-acme');
  });

  it('appends suffix on collision', () => {
    const taken = new Set(['org-acme']);
    const slug = generateUniqueSlug('org_acme', (s) => taken.has(s));
    expect(slug).toBe('org-acme-2');
  });

  it('increments suffix on multiple collisions', () => {
    const taken = new Set(['org-acme', 'org-acme-2', 'org-acme-3']);
    const slug = generateUniqueSlug('org_acme', (s) => taken.has(s));
    expect(slug).toBe('org-acme-4');
  });
});
