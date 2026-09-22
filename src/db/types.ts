export type DbType = 'mysql' | 'postgres';

export interface DbConnectionConfig {
  dbId: string;
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema?: string;
  description?: string;
  permissions: DbPermissions;
  createdAt: string;
  updatedAt: string;
}

export interface DbPermissions {
  dmlQuery: boolean;
  dmlUpdate: boolean;
  dmlDelete: boolean;
  ddl: boolean;
}

export interface TableInfo {
  tableName: string;
  tableComment: string;
}

export interface SchemaColumn {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
  columnKey: string;
  columnComment: string;
}

export interface TableIndex {
  indexName: string;
  columnName: string;
  seqInIndex: number;
  isUnique: boolean;
  isPrimary: boolean;
  indexType: string;
  comment: string;
}

export interface TablePartition {
  partitionName: string;
  partitionDescription: string;
  tableRows: number;
  dataLength: number;
}

export interface SchemaTable {
  tableName: string;
  tableComment: string;
  columns: SchemaColumn[];
  indexes?: TableIndex[];
  partitions?: TablePartition[];
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  fields: string[];
  rowCount: number;
  affectedRows?: number;
  executionTimeMs: number;
}