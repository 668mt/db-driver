import { readFileSync } from 'fs';
import { resolve } from 'path';

import { getEnabledConnection } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { runSqlBatch } from '../db/batch.js';
import { translateDbError } from '../utils/errors.js';
import { errorResult, textResult, type McpToolResult } from './tools.js';

/** 执行 .sql 脚本文件（逐条做权限校验） */
export async function toolScript(args: {
  dbId: string;
  file: string;
  dryRun?: boolean;
  continueOnError?: boolean;
  limit?: number;
}): Promise<McpToolResult> {
  if (!args.file || !args.file.trim()) {
    return errorResult('脚本文件路径不能为空');
  }
  let conn;
  try {
    conn = getEnabledConnection(args.dbId);
  } catch (e) {
    return errorResult((e as Error).message);
  }
  if (!conn) {
    return errorResult(`数据库连接不存在: ${args.dbId}`);
  }

  const path = resolve(args.file);
  let sqlText: string;
  try {
    sqlText = readFileSync(path, 'utf8');
  } catch (e) {
    return errorResult(`脚本文件读取失败: ${path}\n${(e as Error).message}`);
  }
  if (!sqlText.trim()) {
    return errorResult(`脚本文件为空: ${path}`);
  }

  const driver = await acquireDriver(conn);
  try {
    const batch = await runSqlBatch(driver, conn, sqlText, {
      limit: Math.min(args.limit ?? 50, 500),
      dryRun: args.dryRun === true,
      stopOnError: args.continueOnError !== true,
    });
    return textResult({
      ok: batch.failed === 0,
      file: path,
      dryRun: args.dryRun === true,
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
    });
  } catch (e) {
    return errorResult(`脚本执行失败: ${translateDbError(e, conn.type)}`);
  }
}
