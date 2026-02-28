import { describe, it, expect } from 'vitest';
import { isValidSlug, generateSlug, generateUniqueSlug, slugifyName } from '../tenant-slug.js';

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

describe('slugifyName', () => {
  it('converts org name to slug', () => {
    expect(slugifyName('Acme Corp')).toBe('acme-corp');
  });

  it('handles special characters', () => {
    expect(slugifyName('My Great Org!')).toBe('my-great-org');
  });

  it('prefixes with org- if starts with number', () => {
    expect(slugifyName('123 Corp')).toBe('org-123-corp');
  });

  it('returns null for names that produce invalid slugs', () => {
    expect(slugifyName('ab')).toBeNull(); // too short
    expect(slugifyName('!!')).toBeNull(); // no valid chars → "org-" → too short
  });

  it('truncates long names to 48 chars', () => {
    const longName = 'a'.repeat(100);
    const result = slugifyName(longName);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(48);
  });
});

describe('generateUniqueSlug', () => {
  it('returns base slug when no collision', async () => {
    const slug = await generateUniqueSlug('org_acme', () => false);
    expect(slug).toBe('org-acme');
  });

  it('appends suffix on collision', async () => {
    const taken = new Set(['org-acme']);
    const slug = await generateUniqueSlug('org_acme', (s) => taken.has(s));
    expect(slug).toBe('org-acme-2');
  });

  it('increments suffix on multiple collisions', async () => {
    const taken = new Set(['org-acme', 'org-acme-2', 'org-acme-3']);
    const slug = await generateUniqueSlug('org_acme', (s) => taken.has(s));
    expect(slug).toBe('org-acme-4');
  });

  it('uses preferredSlug when provided and valid', async () => {
    const slug = await generateUniqueSlug('org_abc123', () => false, 'acme-corp');
    expect(slug).toBe('acme-corp');
  });

  it('falls back to orgId slug when preferredSlug is invalid', async () => {
    const slug = await generateUniqueSlug('org_acme', () => false, 'ab'); // too short
    expect(slug).toBe('org-acme');
  });

  it('falls back to orgId slug when preferredSlug is null', async () => {
    const slug = await generateUniqueSlug('org_acme', () => false, null);
    expect(slug).toBe('org-acme');
  });

  it('handles collision on preferredSlug with suffix', async () => {
    const taken = new Set(['acme-corp']);
    const slug = await generateUniqueSlug('org_abc123', (s) => taken.has(s), 'acme-corp');
    expect(slug).toBe('acme-corp-2');
  });
});
