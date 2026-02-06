import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'ecom',
  user: process.env.POSTGRES_USER || 'cube',
  password: process.env.POSTGRES_PASSWORD || 'cube',
});

export interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

export interface TableInfo {
  table_name: string;
  table_schema: string;
  columns: TableColumn[];
}

export interface ForeignKey {
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

export interface SuggestedMeasure {
  name: string;
  type: 'count' | 'sum' | 'avg' | 'count_distinct' | 'min' | 'max';
  sql?: string;
  column?: string;
  title: string;
}

export interface SuggestedDimension {
  name: string;
  sql: string;
  type: 'string' | 'number' | 'time' | 'boolean';
  title: string;
  primaryKey?: boolean;
}

export async function getTables(): Promise<TableInfo[]> {
  const tablesResult = await pool.query(`
    SELECT table_name, table_schema
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const tables: TableInfo[] = [];

  for (const row of tablesResult.rows) {
    const columnsResult = await pool.query<TableColumn>(
      `
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
      [row.table_schema, row.table_name]
    );

    tables.push({
      table_name: row.table_name,
      table_schema: row.table_schema,
      columns: columnsResult.rows,
    });
  }

  return tables;
}

export async function getTableDetails(tableName: string): Promise<{
  table: TableInfo;
  foreignKeys: ForeignKey[];
  suggestedMeasures: SuggestedMeasure[];
  suggestedDimensions: SuggestedDimension[];
}> {
  const columnsResult = await pool.query<TableColumn>(
    `
    SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
    [tableName]
  );

  if (columnsResult.rows.length === 0) {
    throw new Error(`Table ${tableName} not found`);
  }

  const fkResult = await pool.query<ForeignKey>(
    `
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = $1
  `,
    [tableName]
  );

  const pkResult = await pool.query(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = $1
      AND tc.constraint_type = 'PRIMARY KEY'
  `,
    [tableName]
  );

  const primaryKeyColumns = pkResult.rows.map((r) => r.column_name);
  const columns = columnsResult.rows;

  // Generate suggested measures
  const suggestedMeasures: SuggestedMeasure[] = [
    { name: 'count', type: 'count', title: `${capitalize(tableName)} Count` },
  ];

  for (const col of columns) {
    if (isNumericType(col.data_type) && !primaryKeyColumns.includes(col.column_name)) {
      const colName = col.column_name;
      suggestedMeasures.push({
        name: `total_${colName}`,
        type: 'sum',
        column: colName,
        sql: `{CUBE}.${colName}`,
        title: `Total ${capitalize(colName)}`,
      });
      suggestedMeasures.push({
        name: `avg_${colName}`,
        type: 'avg',
        column: colName,
        sql: `{CUBE}.${colName}`,
        title: `Average ${capitalize(colName)}`,
      });
    }
  }

  // Generate suggested dimensions
  const suggestedDimensions: SuggestedDimension[] = columns.map((col) => ({
    name: col.column_name,
    sql: `{CUBE}.${col.column_name}`,
    type: mapSqlTypeToCubeType(col.data_type),
    title: capitalize(col.column_name.replace(/_/g, ' ')),
    primaryKey: primaryKeyColumns.includes(col.column_name),
  }));

  return {
    table: {
      table_name: tableName,
      table_schema: 'public',
      columns,
    },
    foreignKeys: fkResult.rows,
    suggestedMeasures,
    suggestedDimensions,
  };
}

export async function getSampleData(
  tableName: string,
  limit: number = 10
): Promise<Record<string, unknown>[]> {
  // Validate table name to prevent SQL injection
  const tableCheck = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );

  if (tableCheck.rows.length === 0) {
    throw new Error(`Table ${tableName} not found`);
  }

  const result = await pool.query(`SELECT * FROM "${tableName}" LIMIT $1`, [limit]);
  return result.rows;
}

export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

function isNumericType(dataType: string): boolean {
  const numericTypes = [
    'integer',
    'bigint',
    'smallint',
    'decimal',
    'numeric',
    'real',
    'double precision',
    'int',
    'int4',
    'int8',
    'float4',
    'float8',
  ];
  return numericTypes.includes(dataType.toLowerCase());
}

function mapSqlTypeToCubeType(dataType: string): 'string' | 'number' | 'time' | 'boolean' {
  const type = dataType.toLowerCase();
  if (
    [
      'integer',
      'bigint',
      'smallint',
      'decimal',
      'numeric',
      'real',
      'double precision',
      'int',
      'int4',
      'int8',
      'float4',
      'float8',
    ].includes(type)
  ) {
    return 'number';
  }
  if (['timestamp', 'timestamptz', 'date', 'time', 'timetz', 'timestamp without time zone', 'timestamp with time zone'].includes(type)) {
    return 'time';
  }
  if (['boolean', 'bool'].includes(type)) {
    return 'boolean';
  }
  return 'string';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { pool };
