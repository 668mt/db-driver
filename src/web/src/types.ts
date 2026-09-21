export type DbType = 'mysql' | 'postgres';

export interface DbPermissions {
  dmlQuery: boolean;
  dmlUpdate: boolean;
  dmlDelete: boolean;
  ddl: boolean;
}

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

export interface UsageEntry {
  index: number;
  addedAt: string;
  dbIds: string[];
  title: string;
  content: string;
}

export interface Toast {
  msg: string;
  type: 'success' | 'error';
  key: number;
}

export type Tab = 'connections' | 'usage';