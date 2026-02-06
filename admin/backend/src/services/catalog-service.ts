import * as yaml from 'yaml';
import * as fs from 'fs/promises';
import { z } from 'zod';

const CATALOG_PATH = process.env.AGENT_CATALOG_PATH || '/Users/syam/db-mcp/agent_catalog.yaml';

// Schema matching the main project's types
const CatalogOverrideSchema = z.object({
  exposed: z.boolean().optional(),
  pii: z.boolean().optional(),
  description: z.string().optional(),
  allowedGroupBy: z.array(z.string()).optional(),
  deniedGroupBy: z.array(z.string()).optional(),
  requiresTimeDimension: z.boolean().optional(),
});

const FilterSchema = z.object({
  member: z.string(),
  operator: z.string(),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const AgentCatalogConfigSchema = z.object({
  version: z.string(),
  defaults: z.object({
    exposed: z.boolean().optional(),
    pii: z.boolean().optional(),
  }).optional(),
  members: z.record(z.string(), CatalogOverrideSchema).optional(),
  defaultSegments: z.array(z.string()).optional(),
  defaultFilters: z.array(FilterSchema).optional(),
});

export type CatalogOverride = z.infer<typeof CatalogOverrideSchema>;
export type AgentCatalogConfig = z.infer<typeof AgentCatalogConfigSchema>;

export interface MemberWithGovernance {
  name: string;
  type: 'measure' | 'dimension' | 'segment';
  cubeName: string;
  memberName: string;
  title?: string;
  description?: string;
  // From Cube meta
  cubeDescription?: string;
  cubeType?: string;
  // Governance
  exposed: boolean;
  pii: boolean;
  allowedGroupBy?: string[];
  deniedGroupBy?: string[];
  requiresTimeDimension?: boolean;
  hasOverride: boolean;
}

export async function readCatalog(): Promise<AgentCatalogConfig> {
  try {
    const content = await fs.readFile(CATALOG_PATH, 'utf-8');
    const parsed = yaml.parse(content);
    return AgentCatalogConfigSchema.parse(parsed);
  } catch (error) {
    // Return default if file doesn't exist
    return {
      version: '1.0',
      defaults: { exposed: true, pii: false },
      members: {},
      defaultSegments: [],
      defaultFilters: [],
    };
  }
}

export async function writeCatalog(config: AgentCatalogConfig): Promise<void> {
  // Validate before writing
  AgentCatalogConfigSchema.parse(config);
  const content = yaml.stringify(config, { lineWidth: 0 });
  await fs.writeFile(CATALOG_PATH, content, 'utf-8');
}

export async function updateMember(
  memberName: string,
  override: CatalogOverride
): Promise<AgentCatalogConfig> {
  const catalog = await readCatalog();

  if (!catalog.members) {
    catalog.members = {};
  }

  // Clean up empty overrides
  const cleanedOverride: CatalogOverride = {};
  if (override.exposed !== undefined) cleanedOverride.exposed = override.exposed;
  if (override.pii !== undefined) cleanedOverride.pii = override.pii;
  if (override.description) cleanedOverride.description = override.description;
  if (override.allowedGroupBy && override.allowedGroupBy.length > 0) {
    cleanedOverride.allowedGroupBy = override.allowedGroupBy;
  }
  if (override.deniedGroupBy && override.deniedGroupBy.length > 0) {
    cleanedOverride.deniedGroupBy = override.deniedGroupBy;
  }
  if (override.requiresTimeDimension !== undefined) {
    cleanedOverride.requiresTimeDimension = override.requiresTimeDimension;
  }

  // Only add if there are actual overrides
  if (Object.keys(cleanedOverride).length > 0) {
    catalog.members[memberName] = cleanedOverride;
  } else {
    // Remove member if no overrides
    delete catalog.members[memberName];
  }

  await writeCatalog(catalog);
  return catalog;
}

export async function updateDefaults(defaults: { exposed?: boolean; pii?: boolean }): Promise<AgentCatalogConfig> {
  const catalog = await readCatalog();
  catalog.defaults = { ...catalog.defaults, ...defaults };
  await writeCatalog(catalog);
  return catalog;
}

export async function removeMemberOverride(memberName: string): Promise<AgentCatalogConfig> {
  const catalog = await readCatalog();
  if (catalog.members) {
    delete catalog.members[memberName];
  }
  await writeCatalog(catalog);
  return catalog;
}

export function mergeWithCubeMeta(
  cubeMeta: { cubes: Array<{ name: string; title?: string; measures: unknown[]; dimensions: unknown[]; segments?: unknown[] }> },
  catalog: AgentCatalogConfig
): MemberWithGovernance[] {
  const members: MemberWithGovernance[] = [];
  const defaults = catalog.defaults || { exposed: true, pii: false };

  for (const cube of cubeMeta.cubes || []) {
    const cubeName = cube.name;

    // Process measures
    for (const measure of (cube.measures || []) as Array<{ name: string; title?: string; description?: string; type?: string }>) {
      // Cube API already returns full names like "Orders.count"
      const fullName = measure.name;
      const memberName = measure.name.includes('.') ? measure.name.split('.').slice(1).join('.') : measure.name;
      const override = catalog.members?.[fullName];

      members.push({
        name: fullName,
        type: 'measure',
        cubeName,
        memberName,
        title: measure.title,
        cubeDescription: measure.description,
        cubeType: measure.type,
        exposed: override?.exposed ?? defaults.exposed ?? true,
        pii: override?.pii ?? defaults.pii ?? false,
        description: override?.description,
        allowedGroupBy: override?.allowedGroupBy,
        deniedGroupBy: override?.deniedGroupBy,
        requiresTimeDimension: override?.requiresTimeDimension,
        hasOverride: !!override,
      });
    }

    // Process dimensions
    for (const dim of (cube.dimensions || []) as Array<{ name: string; title?: string; description?: string; type?: string }>) {
      // Cube API already returns full names like "Orders.status"
      const fullName = dim.name;
      const memberName = dim.name.includes('.') ? dim.name.split('.').slice(1).join('.') : dim.name;
      const override = catalog.members?.[fullName];

      members.push({
        name: fullName,
        type: 'dimension',
        cubeName,
        memberName,
        title: dim.title,
        cubeDescription: dim.description,
        cubeType: dim.type,
        exposed: override?.exposed ?? defaults.exposed ?? true,
        pii: override?.pii ?? defaults.pii ?? false,
        description: override?.description,
        allowedGroupBy: override?.allowedGroupBy,
        deniedGroupBy: override?.deniedGroupBy,
        hasOverride: !!override,
      });
    }

    // Process segments
    for (const seg of (cube.segments || []) as Array<{ name: string; title?: string; description?: string }>) {
      // Cube API already returns full names like "Orders.completed_orders"
      const fullName = seg.name;
      const memberName = seg.name.includes('.') ? seg.name.split('.').slice(1).join('.') : seg.name;
      const override = catalog.members?.[fullName];

      members.push({
        name: fullName,
        type: 'segment',
        cubeName,
        memberName,
        title: seg.title,
        cubeDescription: seg.description,
        exposed: override?.exposed ?? defaults.exposed ?? true,
        pii: override?.pii ?? defaults.pii ?? false,
        description: override?.description,
        hasOverride: !!override,
      });
    }
  }

  return members;
}
