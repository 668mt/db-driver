import { checkSqlPermission, SqlPermissionError, type SqlAction } from './permissions.js';
import { splitSqlStatements, type SplitStatement } from './sqlSplit.js';
import { translateDbError } from '../utils/errors.js';
import type { DbDriver } from './index.js';
import type { DbConnectionConfig } from './types.js';

export interface BatchStatementResult {
  index: number;
  sql: string;
  action: SqlAction;
  ok: boolean;
  rowCount: number;
  affectedRows: number | null;
  fields: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  executionTimeMs: number;
  error?: string;
}

export interface BatchOptions {
  /** 每条 SELECT 最多返回多少行 */
  limit: number;
  /** 只做权限校验，不真正执行 */
  dryRun: boolean;
  /** 出错后是否停止后续语句（默认停止） */
  stopOnError: boolean;
}

export interface BatchResult {
  statements: BatchStatementResult[];
  executed: number;
  failed: number;
  totalTimeMs: number;
  /** 整批被拒绝时的说明（权限预检未通过） */
  error?: string;
}

/**
 * 批量执行 SQL 脚本 / 多语句 SQL。
 *
 * 安全约定：
 * 1. 每条语句都单独走 `checkSqlPermission`（AST 解析 + 权限位拦截），不允许整包放行。
 * 2. 拆分时**保留注释原文**，避免 `U/** PATCH` 这类注释断字被拆干净后当成合法 SQL 放行。
 * 3. 解析失败 → dangerous → 拒绝（失败安全）。
 */
export async function runSqlBatch(
  driver: DbDriver,
  conn: DbConnectionConfig,
  sqlText: string,
  options: BatchOptions
): Promise<BatchResult> {
  const statements = splitSqlStatements(sqlText);
  const results: BatchStatementResult[] = [];
  const started = Date.now();
  let executed = 0;
  let failed = 0;

  // 第一阶段：全量预检权限。
  // 批量场景下必须先确认整包都在权限内再动手，否则会出现「前几条已改库、
  // 到第 N 条才发现越权」的半吊子状态。预检不通过时一条都不执行。
  const prechecked = statements.map((stmt) => precheck(stmt, conn));

  const denied = prechecked.filter((item) => item.permissionError);
  if (denied.length > 0 && options.stopOnError) {
    // 整批拒绝：一条都不执行，把越权的那条原文报出来
    const first = denied[0];
    const rest = denied.length - 1;
    return {
      statements: prechecked.map((item) => ({
        ...item.base,
        ok: false,
        error: item.permissionError ?? '因同批次存在越权语句，整批未执行',
      })),
      executed: 0,
      failed: denied.length,
      totalTimeMs: Date.now() - started,
      error:
        `权限校验未通过，整批拒绝执行（第 ${first.base.index} 条）：${first.permissionError}` +
        (rest > 0 ? `\n另有 ${rest} 条语句同样被拒绝` : ''),
    };
  }

  for (const item of prechecked) {
    if (item.permissionError) {
      failed += 1;
      results.push({ ...item.base, error: item.permissionError });
      if (options.stopOnError) break;
      continue;
    }

    const result = await runOne(driver, conn, item.base, item.action, options);
    results.push(result);

    if (!result.ok) {
      failed += 1;
      if (options.stopOnError) break;
      continue;
    }
    executed += 1;
  }

  return {
    statements: results,
    executed,
    failed,
    totalTimeMs: Date.now() - started,
  };
}

interface Prechecked {
  base: BatchStatementResult;
  action: SqlAction;
  permissionError?: string;
}

function precheck(stmt: SplitStatement, conn: DbConnectionConfig): Prechecked {
  const base: BatchStatementResult = {
    index: stmt.index,
    sql: stmt.sql,
    action: 'query',
    ok: false,
    rowCount: 0,
    affectedRows: null,
    fields: [],
    rows: [],
    truncated: false,
    executionTimeMs: 0,
  };

  try {
    const action = checkSqlPermission(stmt.sql, conn.permissions, conn.type);
    return { base: { ...base, action }, action };
  } catch (e) {
    const message = (e as Error).message;
    const action = e instanceof SqlPermissionError ? e.action : 'dangerous';
    return { base: { ...base, action }, action, permissionError: message };
  }
}

async function runOne(
  driver: DbDriver,
  conn: DbConnectionConfig,
  base: BatchStatementResult,
  action: SqlAction,
  options: BatchOptions
): Promise<BatchStatementResult> {
  if (options.dryRun) {
    return { ...base, ok: true, executionTimeMs: 0 };
  }

  try {
    const res = await driver.query(base.sql);
    const truncated = action === 'query' && res.rows.length > options.limit;
    return {
      ...base,
      action,
      ok: true,
      rowCount: res.rowCount,
      affectedRows: res.affectedRows ?? null,
      fields: res.fields,
      rows: truncated ? res.rows.slice(0, options.limit) : res.rows,
      truncated,
      executionTimeMs: res.executionTimeMs,
    };
  } catch (e) {
    return {
      ...base,
      action,
      error: translateDbError(e, conn.type),
    };
  }
}
