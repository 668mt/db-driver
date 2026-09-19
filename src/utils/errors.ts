import type { DbType } from '../db/types.js';

interface DbError {
  code?: string | number;
  sqlState?: string;
  errno?: number;
  message: string;
}

const MYSQL_ERROR_MAP: Record<number, string> = {
  1045: '访问被拒绝：用户名或密码错误',
  1049: '数据库不存在',
  1044: '访问被拒绝：当前用户无权访问该数据库',
  1146: '表不存在',
  1064: 'SQL 语法错误',
  1062: '唯一键冲突（重复插入）',
  1054: '未知列',
  2002: '无法连接到数据库主机（连接被拒绝）',
  2003: '无法连接到数据库主机（端口不可达）',
  2013: '连接丢失（网络问题或查询超时）',
  1213: '死锁，请重试',
  1205: '锁等待超时',
  1142: '权限不足',
  1141: '权限不足',
};

const PG_SQLSTATE_MAP: Record<string, string> = {
  '28P01': '身份验证失败：用户名或密码错误',
  '3D000': '数据库（catalog）不存在',
  '42P01': '表或视图不存在',
  '42601': 'SQL 语法错误',
  '42703': '列不存在',
  '08006': '连接失败',
  '08001': '无法建立连接',
  '08000': '连接异常',
  '08003': '连接不存在',
  '40P01': '死锁，请重试',
  '55P03': '锁等待超时，请稍后重试',
  '42501': '权限不足',
  '23505': '唯一键冲突（重复插入）',
  '23502': '非空约束违反',
  '23503': '外键约束违反',
};

export function translateDbError(err: unknown, dbType: DbType): string {
  if (!err || typeof err !== 'object') {
    return String(err ?? '未知错误');
  }
  const e = err as DbError;
  const original = e.message ?? String(err);

  if (dbType === 'mysql') {
    const code = typeof e.errno === 'number' ? e.errno : typeof e.code === 'number' ? e.code : undefined;
    if (code !== undefined && MYSQL_ERROR_MAP[code]) {
      return `${MYSQL_ERROR_MAP[code]}（${original}）`;
    }
    const codeStr = String(e.code ?? '');
    if (codeStr === 'ECONNREFUSED') {
      return '连接被拒绝：检查 host/port 是否正确，数据库服务是否启动';
    }
    if (codeStr === 'ETIMEDOUT' || codeStr === 'ECONNRESET') {
      return '网络超时/连接被重置：检查网络或增加超时';
    }
    if (codeStr === 'ENOTFOUND') {
      return '主机无法解析：检查 host 是否正确';
    }
    if (codeStr === 'ER_ACCESS_DENIED_ERROR') {
      return '访问被拒绝：用户名或密码错误';
    }
  }

  if (dbType === 'postgres') {
    const sqlState = e.sqlState ?? (typeof e.code === 'string' ? e.code : undefined);
    if (sqlState && PG_SQLSTATE_MAP[sqlState]) {
      return `${PG_SQLSTATE_MAP[sqlState]}（${original}）`;
    }
    const codeStr = String(e.code ?? '');
    if (codeStr === 'ECONNREFUSED') {
      return '连接被拒绝：检查 host/port 是否正确，PostgreSQL 服务是否启动';
    }
    if (codeStr === 'ETIMEDOUT' || codeStr === 'ECONNRESET') {
      return '网络超时/连接被重置：检查网络或增加超时';
    }
    if (codeStr === 'ENOTFOUND') {
      return '主机无法解析：检查 host 是否正确';
    }
  }

  return original;
}

export function isDbError(err: unknown): err is DbError {
  return !!err && typeof err === 'object';
}