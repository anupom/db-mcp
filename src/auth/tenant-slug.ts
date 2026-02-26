/**
 * Tenant slug validation and generation utilities.
 *
 * Slugs: 3-48 chars, starts with letter, lowercase alphanumeric + hyphens.
 */

const SLUG_REGEX = /^[a-z][a-z0-9-]{2,47}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

/**
 * Derive an initial slug from a Clerk org ID.
 * E.g. "org_abc123" → "org-abc123", "org_ABC" → "org-abc"
 */
export function generateSlug(orgId: string): string {
  const slug = orgId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')   // replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')            // collapse consecutive hyphens
    .replace(/^-|-$/g, '');         // trim leading/trailing hyphens

  // Ensure starts with a letter
  const result = /^[a-z]/.test(slug) ? slug : `org-${slug}`;

  // Truncate to 48 chars
  return result.slice(0, 48);
}

/**
 * Derive a slug from an org name.
 * E.g. "Acme Corp" → "acme-corp", "My Great Org!" → "my-great-org"
 */
export function slugifyName(name: string): string | null {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) return null;

  const result = /^[a-z]/.test(slug) ? slug : `org-${slug}`;
  const truncated = result.slice(0, 48).replace(/-$/, ''); // trim trailing hyphen from truncation

  return isValidSlug(truncated) ? truncated : null;
}

/**
 * Generate a unique slug by appending numeric suffixes on collision.
 * Prefers `preferredSlug` (e.g. from Clerk org slug/name) over the org ID fallback.
 */
export function generateUniqueSlug(
  orgId: string,
  slugExists: (slug: string) => boolean,
  preferredSlug?: string | null
): string {
  const base = preferredSlug && isValidSlug(preferredSlug)
    ? preferredSlug
    : generateSlug(orgId);

  if (!slugExists(base)) {
    return base;
  }

  // Truncate base to leave room for suffix
  const maxBase = base.slice(0, 44);
  for (let i = 2; i <= 999; i++) {
    const candidate = `${maxBase}-${i}`;
    if (!slugExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not generate unique slug for org ${orgId}`);
}
