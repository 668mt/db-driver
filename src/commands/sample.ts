import { getConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { checkSqlPermission, SqlPermissionError } from '../db/permissions.js';
import { translateDbError } from '../utils/errors.js';

export interface SampleOptions {
  limit: number;
  where?: string;
  json: boolean;
}

export async function runSample(dbId: string, table: string, options: SampleOptions): Promise<void> {
  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}`);
  }

  const whereClause = options.where ? ` WHERE ${options.where}` : '';
  const sql = `SELECT * FROM ${quoteIdent(table, conn.type)}${whereClause} LIMIT ${options.limit}`;
  checkSqlPermission(sql, conn.permissions, conn.type);

  const driver = await acquireDriver(conn);
  try {
    const result = await driver.query(sql);
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            table,
            rowCount: result.rowCount,
            fields: result.fields,
            rows: result.rows,
            executionTimeMs: result.executionTimeMs,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(`\n📊 ${table} - ${result.rows.length} 行 (${result.executionTimeMs}ms)\n`);
    if (result.rows.length === 0) {
      console.log('(空)');
      return;
    }
    console.log(formatTable(result.rows));
  } catch (e) {
    if (e instanceof SqlPermissionError) throw e;
    throw new Error(`采样失败: ${translateDbError(e, conn.type)}`);
  } finally {
    closeConfigDb();
  }
}

export function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length))
  );
  widths.forEach((w, i) => (widths[i] = Math.min(w, 60)));
  const pad = (s: string, w: number) => {
    const truncated = s.length > w ? s.slice(0, w - 1) + '…' : s;
    return truncated.length >= w ? truncated : truncated + ' '.repeat(w - truncated.length);
  };

  const header = keys.map((k, i) => pad(k, widths[i])).join(' | ');
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
  const body = rows
    .map((r) => keys.map((k, i) => pad(String(r[k] ?? 'NULL'), widths[i])).join(' | '))
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

function quoteIdent(name: string, dbType: 'mysql' | 'postgres'): string {
  if (dbType === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
  return '"' + name.replace(/"/g, '""') + '"';
}