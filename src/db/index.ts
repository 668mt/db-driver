import type {
  DbConnectionConfig,
  QueryResult,
  SchemaColumn,
  SchemaTable,
  TableInfo,
} from './types.js';

export interface DbDriver {
  testConnection(): Promise<void>;
  close(): Promise<void>;
  query(sql: string): Promise<QueryResult>;
  listTables(options?: { schema?: string; search?: string; limit?: number; offset?: number }): Promise<TableInfo[]>;
  getTable(name: string, schema?: string): Promise<SchemaTable | null>;
  getSchema(database?: string, schema?: string): Promise<SchemaTable[]>;
}

export async function createDriver(config: DbConnectionConfig): Promise<DbDriver> {
  switch (config.type) {
    case 'mysql': {
      const { createMysqlDriver } = await import('./mysql.js');
      return createMysqlDriver(config);
    }
    case 'postgres': {
      const { createPostgresDriver } = await import('./postgres.js');
      return createPostgresDriver(config);
    }
    default:
      throw new Error(`Unsupported database type: ${config.type as string}`);
  }
}

export function mapColumns(rows: Array<Record<string, unknown>>): SchemaColumn[] {
  return rows.map((r) => ({
    tableName: r.tableName as string,
    columnName: r.columnName as string,
    dataType: r.dataType as string,
    isNullable: Boolean(r.isNullable),
    columnDefault: (r.columnDefault as string | null) ?? null,
    columnKey: (r.columnKey as string) ?? '',
    columnComment: (r.columnComment as string) ?? '',
  }));
}