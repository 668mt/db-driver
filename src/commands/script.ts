import { readFileSync } from 'fs';
import { resolve } from 'path';

import { getEnabledConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { runSqlBatch } from '../db/batch.js';
import { splitSqlStatements } from '../db/sqlSplit.js';

export interface ScriptOptions {
  limit: number;
  json: boolean;
  dryRun: boolean;
  continueOnError: boolean;
}

export async function runScript(dbId: string, file: string, options: ScriptOptions): Promise<void> {
  if (!file || !file.trim()) {
    throw new Error('脚本文件路径不能为空');
  }

  const conn = getEnabledConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}\n运行 db-driver list 查看已配置的连接`);
  }

  const path = resolve(file);
  let sqlText: string;
  try {
    sqlText = readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`脚本文件读取失败: ${path}\n${(e as Error).message}`);
  }

  if (!sqlText.trim()) {
    throw new Error(`脚本文件为空: ${path}`);
  }

  const statements = splitSqlStatements(sqlText);
  if (statements.length === 0) {
    throw new Error(`脚本文件里没有可执行的 SQL 语句: ${path}`);
  }

  const driver = await acquireDriver(conn);
  try {
    const batch = await runSqlBatch(driver, conn, sqlText, {
      limit: options.limit,
      dryRun: options.dryRun,
      stopOnError: !options.continueOnError,
    });

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: batch.failed === 0,
            file: path,
            dryRun: options.dryRun,
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
      const mode = options.dryRun ? '（dry-run，仅校验权限，不执行）' : '';
      console.log(`\n📜 脚本 ${path}${mode}`);
      console.log(`   共 ${batch.statements.length} 条语句\n`);
      if (batch.error) {
        console.log(`❌ ${batch.error}\n`);
        for (const s of batch.statements) {
          console.log(`  ⛔ [${s.index}] ${s.error ?? '整批未执行'}`);
        }
        throw new Error(batch.error);
      }
      for (const s of batch.statements) {
        if (s.ok) {
          const detail =
            s.action === 'query'
              ? `返回 ${s.rowCount} 行`
              : `影响 ${s.affectedRows ?? 0} 行`;
          const time = options.dryRun ? '' : ` (${s.executionTimeMs}ms)`;
          console.log(`  ✅ [${s.index}] ${s.action} · ${detail}${time}`);
          console.log(`       ${firstLine(s.sql)}`);
        } else {
          console.log(`  ❌ [${s.index}] ${s.error}`);
          console.log(`       ${firstLine(s.sql)}`);
        }
      }
      console.log(
        `\n完成：成功 ${batch.executed} 条，失败 ${batch.failed} 条，总耗时 ${batch.totalTimeMs}ms`
      );
    }

    if (batch.failed > 0) {
      const firstError = batch.statements.find((s) => !s.ok);
      throw new Error(
        `脚本执行失败（第 ${firstError?.index} 条）：${firstError?.error}\n` +
          `已成功执行 ${batch.executed} 条语句`
      );
    }
  } finally {
    closeConfigDb();
  }
}

function firstLine(sql: string): string {
  const line = sql.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return line.length > 100 ? line.slice(0, 99) + '…' : line;
}
