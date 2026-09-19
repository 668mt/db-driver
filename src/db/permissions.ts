import pkg from 'node-sql-parser';
import type { DbPermissions, DbType } from './types.js';

const { Parser } = pkg;
const parser = new Parser();

export type SqlAction = 'query' | 'update' | 'delete' | 'ddl' | 'dangerous';

const QUERY_TYPES = new Set([
  'select',
  'show',
  'describe',
  'desc',
  'explain',
  'use',
]);
const UPDATE_TYPES = new Set(['insert', 'update', 'replace', 'merge']);
const DELETE_TYPES = new Set(['delete']);
const DDL_TYPES = new Set([
  'create',
  'alter',
  'drop',
  'truncate',
  'rename',
  'comment',
  'grant',
  'revoke',
]);
const DANGEROUS_TYPES = new Set([
  'call',
  'load_data',
  'load',
  'do',
  'set',
  'prepare',
  'execute',
  'deallocate',
]);

function classifyType(rawType: string | undefined): SqlAction {
  const t = (rawType ?? '').toLowerCase();
  if (QUERY_TYPES.has(t)) return 'query';
  if (UPDATE_TYPES.has(t)) return 'update';
  if (DELETE_TYPES.has(t)) return 'delete';
  if (DDL_TYPES.has(t)) return 'ddl';
  if (DANGEROUS_TYPES.has(t)) return 'dangerous';
  return 'dangerous';
}

export class SqlPermissionError extends Error {
  constructor(message: string, public readonly action: SqlAction) {
    super(message);
    this.name = 'SqlPermissionError';
  }
}

export function detectSqlAction(sql: string, dbType: DbType = 'mysql'): SqlAction {
  const dialect = dbType === 'postgres' ? 'postgresql' : 'mysql';

  let ast: unknown;
  try {
    ast = parser.astify(sql, { database: dialect });
  } catch (e) {
    throw new SqlPermissionError(
      `无法解析 SQL，已拒绝（疑似绕过技巧如注释断字、MySQL 条件注释等）: ${(e as Error).message}`,
      'dangerous'
    );
  }

  const statements: unknown[] = [];
  if (ast == null) {
    // null
  } else if (Array.isArray(ast)) {
    statements.push(...ast);
  } else {
    statements.push(ast);
  }

  if (statements.length === 0) {
    throw new SqlPermissionError('SQL 解析结果为空，已拒绝', 'dangerous');
  }
  if (statements.length > 1) {
    throw new SqlPermissionError(
      `检测到 ${statements.length} 条 SQL 语句，仅支持单条执行`,
      'dangerous'
    );
  }

  const stmt = statements[0] as { type?: string; ast?: { type?: string } };
  const rawType = stmt.type ?? stmt.ast?.type;
  if (!rawType) {
    throw new SqlPermissionError('无法识别 SQL 类型，已拒绝', 'dangerous');
  }

  return classifyType(rawType);
}

export function checkSqlPermission(
  sql: string,
  permissions: DbPermissions,
  dbType: DbType = 'mysql'
): SqlAction {
  const action = detectSqlAction(sql, dbType);
  switch (action) {
    case 'query':
      if (!permissions.dmlQuery) {
        throw new SqlPermissionError('DML 查询 (SELECT) 已被禁用', action);
      }
      break;
    case 'update':
      if (!permissions.dmlUpdate) {
        throw new SqlPermissionError('DML 更新 (INSERT/UPDATE) 已被禁用', action);
      }
      break;
    case 'delete':
      if (!permissions.dmlDelete) {
        throw new SqlPermissionError('DML 删除 (DELETE) 已被禁用', action);
      }
      break;
    case 'ddl':
      if (!permissions.ddl) {
        throw new SqlPermissionError('DDL 语句已被禁用', action);
      }
      break;
    case 'dangerous':
      if (!permissions.ddl) {
        throw new SqlPermissionError(
          '危险语句 (CALL/LOAD DATA/PREPARE 等) 需要开启 DDL 权限',
          action
        );
      }
      break;
  }
  return action;
}

export function hasMultipleStatements(sql: string): boolean {
  const stripped = sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
  return stripped.includes(';');
}