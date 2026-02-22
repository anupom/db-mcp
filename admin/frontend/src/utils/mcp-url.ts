/**
 * Build the MCP endpoint URL for a given database.
 * When slug is provided (SaaS mode), returns /mcp/:slug/:databaseId.
 * Otherwise (self-hosted), returns /mcp/:databaseId.
 */
export function buildMcpUrl(databaseId: string, slug?: string | null): string {
  if (slug) {
    return `/mcp/${slug}/${databaseId}`;
  }
  return `/mcp/${databaseId}`;
}
