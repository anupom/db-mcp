import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { CubeConfig, MeasureConfig, DimensionConfig } from './cube-generator.js';

const EnhancedCubeSchema = z.object({
  title: z.string().describe('Human-friendly title for the cube'),
  description: z.string().describe('Brief description of what this data represents'),
  measures: z.array(z.object({
    name: z.string(),
    type: z.enum(['count', 'sum', 'avg', 'count_distinct', 'min', 'max']),
    sql: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
  })),
  dimensions: z.array(z.object({
    name: z.string(),
    sql: z.string(),
    type: z.enum(['string', 'number', 'time', 'boolean']),
    title: z.string(),
    description: z.string().optional(),
    primary_key: z.boolean().optional(),
  })),
});

export async function enhanceCubeWithLLM(
  tableName: string,
  initialConfig: CubeConfig,
  sampleData?: Record<string, unknown>[]
): Promise<CubeConfig> {
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5-20250929'),
    schema: EnhancedCubeSchema,
    prompt: `You are enhancing a Cube.js cube definition. Cube.js is a semantic layer for analytics that sits between your database and applications.

## Cube.js Concepts:

**Measures** - Aggregated numeric values used for quantitative analysis:
- \`count\`: Count of rows (e.g., "Total Orders", "Number of Users")
- \`sum\`: Sum of a numeric column (e.g., "Total Revenue", "Total Quantity")
- \`avg\`: Average of a numeric column (e.g., "Average Order Value", "Avg Response Time")
- \`min\`/\`max\`: Minimum/maximum values (e.g., "First Purchase Date", "Highest Sale")
- \`count_distinct\`: Count of unique values (e.g., "Unique Customers", "Distinct Products")

**Dimensions** - Attributes used to group, filter, and slice data:
- \`string\`: Categorical data (names, statuses, categories, IDs displayed as text)
- \`number\`: Numeric attributes not meant for aggregation (IDs, codes, quantities per row)
- \`time\`: Date/datetime fields (created_at, updated_at, order_date) - crucial for time-series analysis
- \`boolean\`: True/false flags (is_active, is_deleted, has_subscription)
- \`primary_key\`: The dimension uniquely identifying each row (usually "id")

**Segments** - Predefined filters for common data subsets (e.g., "Active Users", "Completed Orders")

## Naming Conventions:
- Measure names: descriptive snake_case (e.g., "total_revenue", "avg_order_value", "unique_customers")
- Dimension names: snake_case matching or derived from column names
- Titles: Human-readable Title Case (e.g., "Total Revenue", "Average Order Value")
- Descriptions: Brief, helpful context for business users who may not know the schema

## Current Cube to Enhance: "${tableName}"

Initial configuration:
${JSON.stringify(initialConfig, null, 2)}

${sampleData ? `Sample data (first 3 rows) - use this to infer business meaning:
${JSON.stringify(sampleData.slice(0, 3), null, 2)}` : ''}

## Your Task:
1. Create a clear, business-friendly title for the cube (e.g., "orders" → "Customer Orders")
2. Write a helpful description explaining what this data represents and typical use cases
3. Improve measure/dimension titles to be human-readable Title Case
4. Add brief descriptions for measures and dimensions explaining their business meaning
5. Keep all existing measures and dimensions - only enhance their metadata (names, titles, descriptions)

Focus on making this cube understandable to business analysts who need to build reports and dashboards.`,
  });

  return {
    ...initialConfig,
    title: object.title,
    description: object.description,
    measures: object.measures as MeasureConfig[],
    dimensions: object.dimensions as DimensionConfig[],
  };
}
