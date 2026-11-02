import { getEnabledConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { checkSqlPermission, SqlPermissionError } from '../db/permissions.js';
import { splitSqlStatements } from '../db/sqlSplit.js';
import { runSqlBatch } from '../db/batch.js';
import { translateDbError } from '../utils/errors.js';
import { formatTable } from './sample.js';

export interface ExecuteOptions {
  limit: number;
  json: boolean;
  /** 出错后继续执行后续语句（默认停止） */
  continueOnError?: boolean;
}

export async function runExecute(dbId: string, sql: string, options: ExecuteOptions): Promise<void> {
  if (!sql || !sql.trim()) {
    throw new Error('SQL 不能为空');
  }

  const conn = getEnabledConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}\n运行 db-driver list 查看已配置的连接`);
  }

  const statements = splitSqlStatements(sql);
  if (statements.length === 0) {
    throw new Error('SQL 不能为空');
  }

  const driver = await acquireDriver(conn);
  try {
    if (statements.length === 1) {
      await executeSingle(driver, conn, statements[0].sql, options);
      return;
    }
    await executeBatch(driver, conn, sql, options);
  } finally {
    closeConfigDb();
  }
}

async function executeSingle(
  driver: Awaited<ReturnType<typeof acquireDriver>>,
  conn: NonNullable<ReturnType<typeof getEnabledConnection>>,
  sql: string,
  options: ExecuteOptions
): Promise<void> {
  const action = checkSqlPermission(sql, conn.permissions, conn.type);

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
        console.log(
          `\n(还有 ${result.rowCount - options.limit} 行未显示。加 --limit N 查看更多，或 --json 输出完整结果)`
        );
      }
    } else {
      console.log(`\n影响行数: ${result.affectedRows ?? 0}`);
    }
  } catch (e) {
    if (e instanceof SqlPermissionError) throw e;
    throw new Error(`SQL 执行失败: ${translateDbError(e, conn.type)}`);
  }
}

async function executeBatch(
  driver: Awaited<ReturnType<typeof acquireDriver>>,
  conn: NonNullable<ReturnType<typeof getEnabledConnection>>,
  sql: string,
  options: ExecuteOptions
): Promise<void> {
  const batch = await runSqlBatch(driver, conn, sql, {
    limit: options.limit,
    dryRun: false,
    stopOnError: !options.continueOnError,
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: batch.failed === 0,
          total: batch.statements.length,
          executed: batch.executed,
          failed: batch.failed,
          totalTimeMs: batch.totalTimeMs,
          error: batch.error ?? null,
          statements: batch.statements.map((s) => ({
            index: s.index,
            action: s.action,
            ok: s.ok,
            rowCount: s.rowCount,
            affectedRows: s.affectedRows,
            fields: s.fields,
            rows: s.rows,
            truncated: s.truncated,
            executionTimeMs: s.executionTimeMs,
            sql: s.sql,
            error: s.error ?? null,
          })),
        },
        null,
        2
      )
    );
  } else {
    if (batch.error) {
      console.log(`\n📜 批量执行 ${batch.statements.length} 条语句`);
      console.log(`\n❌ ${batch.error}\n`);
      for (const s of batch.statements) {
        console.log(`  ⛔ [${s.index}] ${s.error ?? '整批未执行'}`);
      }
      throw new Error(batch.error);
    }
    console.log(`\n📜 批量执行 ${batch.statements.length} 条语句\n`);
    for (const s of batch.statements) {
      if (s.ok) {
        const detail =
          s.action === 'query'
            ? `返回 ${s.rowCount} 行`
            : `影响 ${s.affectedRows ?? 0} 行`;
        console.log(`  ✅ [${s.index}] ${detail} (${s.executionTimeMs}ms)`);
        if (s.action === 'query' && s.rows.length > 0 && s.rows.length <= 20) {
          console.log(
            s.rows
              .map((r) => `       ${JSON.stringify(r)}`)
              .join('\n')
          );
        }
      } else {
        console.log(`  ❌ [${s.index}] ${s.error}`);
      }
    }
    console.log(
      `\n完成：成功 ${batch.executed} 条，失败 ${batch.failed} 条，总耗时 ${batch.totalTimeMs}ms`
    );
  }

  if (batch.failed > 0) {
    const firstError = batch.statements.find((s) => !s.ok);
    throw new Error(
      `批量执行失败（第 ${firstError?.index} 条）：${firstError?.error}\n` +
        `已成功执行 ${batch.executed} 条语句`
    );
  }
}
