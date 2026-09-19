import { getConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { checkSqlPermission, hasMultipleStatements, SqlPermissionError } from '../db/permissions.js';
import { translateDbError } from '../utils/errors.js';
import { formatTable } from './sample.js';

export interface ExecuteOptions {
  limit: number;
  json: boolean;
}

export async function runExecute(dbId: string, sql: string, options: ExecuteOptions): Promise<void> {
  if (!sql || !sql.trim()) {
    throw new Error('SQL 不能为空');
  }
  if (hasMultipleStatements(sql)) {
    throw new Error('不支持多条 SQL 语句（以分号分隔）。如需批量执行请循环调用');
  }

  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}\n运行 db-driver list 查看已配置的连接`);
  }

  const action = checkSqlPermission(sql, conn.permissions, conn.type);

  const driver = await acquireDriver(conn);
  try {
    const result = await driver.query(sql);

    if (options.json) {
      const truncated = action === 'query' && result.rows.length > options.limit;
      const displayRows = truncated ? result.rows.slice(0, options.limit) : result.rows;
      console.log(
        JSON.stringify(
          {
            ok: true,
            action,
            rowCount: result.rowCount,
            affectedRows: result.affectedRows ?? null,
            fields: result.fields,
            rows: displayRows,
            truncated,
            executionTimeMs: result.executionTimeMs,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(`✅ 执行成功 (${result.executionTimeMs}ms)`);

    if (action === 'query') {
      if (result.rows.length === 0) {
        console.log('\n(查询无返回结果)');
        return;
      }
      const truncated = result.rows.length > options.limit;
      const displayRows = truncated ? result.rows.slice(0, options.limit) : result.rows;
      console.log(`\n📊 返回 ${result.rowCount} 行${truncated ? `，仅显示前 ${options.limit} 行` : ''}:\n`);
      console.log(formatTable(displayRows));
      if (truncated) {
        console.log(`\n(还有 ${result.rowCount - options.limit} 行未显示。加 --limit N 查看更多，或 --json 输出完整结果)`);
      }
    } else {
      console.log(`\n影响行数: ${result.affectedRows ?? 0}`);
    }
  } catch (e) {
    if (e instanceof SqlPermissionError) throw e;
    throw new Error(`SQL 执行失败: ${translateDbError(e, conn.type)}`);
  } finally {
    closeConfigDb();
  }
}