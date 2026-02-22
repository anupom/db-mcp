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
 * Generate a unique slug by appending numeric suffixes on collision.
 */
export async function generateUniqueSlug(
  orgId: string,
  slugExists: (slug: string) => boolean
): Promise<string> {
  const base = generateSlug(orgId);

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
