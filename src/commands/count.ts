import { getConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { checkSqlPermission, SqlPermissionError } from '../db/permissions.js';
import { translateDbError } from '../utils/errors.js';
import { quoteQualifiedTable } from '../utils/ident.js';

export interface CountOptions {
  where?: string;
  json: boolean;
}

export async function runCount(dbId: string, table: string, options: CountOptions): Promise<void> {
  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}`);
  }

  const whereClause = options.where ? ` WHERE ${options.where}` : '';
  const sql = `SELECT COUNT(*) AS cnt FROM ${quoteQualifiedTable(table, conn.schema, conn.type)}${whereClause}`;
  checkSqlPermission(sql, conn.permissions, conn.type);

  const driver = await acquireDriver(conn);
  try {
    const result = await driver.query(sql);
    const cnt = Number(result.rows[0]?.cnt ?? 0);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            table,
            where: options.where ?? null,
            count: cnt,
            executionTimeMs: result.executionTimeMs,
          },
          null,
          2
        )
      );
      return;
    }

    const whereText = options.where ? ` (WHERE ${options.where})` : '';
    console.log(`\n🔢 ${table}${whereText}: ${cnt} 行 (${result.executionTimeMs}ms)\n`);
  } catch (e) {
    if (e instanceof SqlPermissionError) throw e;
    throw new Error(`统计失败: ${translateDbError(e, conn.type)}`);
  } finally {
    closeConfigDb();
  }
}