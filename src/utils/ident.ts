import type { DbType } from '../db/types.js';

export function quoteIdent(name: string, dbType: DbType): string {
  if (dbType === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
  return '"' + name.replace(/"/g, '""') + '"';
}

export function quoteQualifiedTable(
  name: string,
  schema: string | undefined,
  dbType: DbType
): string {
  if (dbType === 'postgres' && schema && schema !== 'public') {
    return `${quoteIdent(schema, dbType)}.${quoteIdent(name, dbType)}`;
  }
  return quoteIdent(name, dbType);
}