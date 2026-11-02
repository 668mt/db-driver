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
  /**
   * 是否启用。`false` = 该连接被禁用，任何数据访问都会被拒绝。
   * 字段缺失（旧配置文件）视为启用，保持向后兼容。
   */
  enabled?: boolean;
  permissions: DbPermissions;
  createdAt: string;
  updatedAt: string;
}

/** 连接是否被禁用（字段缺失 = 启用） */
export function isConnectionEnabled(conn: Pick<DbConnectionConfig, 'enabled'>): boolean {
  return conn.enabled !== false;
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