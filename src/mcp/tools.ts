import { getEnabledConnection, listConnections, setConnectionEnabled } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { checkSqlPermission } from '../db/permissions.js';
import { runSqlBatch } from '../db/batch.js';
import { quoteQualifiedTable } from '../utils/ident.js';
import { translateDbError } from '../utils/errors.js';
import type { DbConnectionConfig } from '../db/types.js';

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function textResult(payload: unknown): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function errorResult(message: string): McpToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function requireConnection(dbId: string): DbConnectionConfig {
  const known = listConnections();
  const found = known.find((c) => c.dbId === dbId);
  if (!found) {
    throw new Error(
      `数据库连接不存在: ${dbId}\n` +
        (known.length > 0 ? `已配置的连接: ${known.map((c) => c.dbId).join(', ')}` : '还没有配置任何连接')
    );
  }
  if (found.enabled === false) {
    throw new Error(
      `数据库连接已被禁用: ${dbId}\n` +
        `禁用的连接不接受任何数据访问。需要时请让用户执行：db-driver enable ${dbId}`
    );
  }
  return found;
}

export async function toolListConnections(): Promise<McpToolResult> {
  const connections = listConnections().map((c) => ({
    dbId: c.dbId,
    type: c.type,
    host: c.host,
    port: c.port,
    database: c.database,
    schema: c.schema ?? null,
    description: c.description ?? null,
    enabled: c.enabled !== false,
    permissions: c.permissions,
  }));
  return textResult({ ok: true, connections });
}

export async function toolSetConnectionEnabled(args: {
  dbId: string;
  enabled: boolean;
}): Promise<McpToolResult> {
  const updated = setConnectionEnabled(args.dbId, args.enabled);
  if (!updated) {
    return errorResult(`数据库连接不存在: ${args.dbId}`);
  }
  return textResult({
    ok: true,
    dbId: updated.dbId,
    enabled: updated.enabled !== false,
    type: updated.type,
    endpoint: `${updated.user}@${updated.host}:${updated.port}/${updated.database}`,
  });
}

export async function toolSchema(args: {
  dbId: string;
  table?: string;
  search?: string;
  schema?: string;
  limit?: number;
  offset?: number;
}): Promise<McpToolResult> {
  const conn = requireConnection(args.dbId);
  const driver = await acquireDriver(conn);
  try {
    if (args.table) {
      const table = await driver.getTable(args.table, args.schema);
      if (!table) {
        return errorResult(`表不存在: ${args.table}`);
      }
      return textResult({ ok: true, table });
    }
    const limit = Math.min(args.limit ?? 100, 500);
    const offset = args.offset ?? 0;
    const { tables, total } = await driver.listTables({
      schema: args.schema,
      search: args.search,
      limit,
      offset,
    });
    return textResult({ ok: true, database: conn.database, total, offset, limit, tables });
  } catch (e) {
    return errorResult(`查询 schema 失败: ${translateDbError(e, conn.type)}`);
  }
}

export async function toolSample(args: {
  dbId: string;
  table: string;
  limit?: number;
  where?: string;
}): Promise<McpToolResult> {
  const conn = requireConnection(args.dbId);
  const limit = Math.min(args.limit ?? 10, 200);
  const where = args.where ? ` WHERE ${args.where}` : '';
  const sql = `SELECT * FROM ${quoteQualifiedTable(args.table, conn.schema, conn.type)}${where} LIMIT ${limit}`;
  checkSqlPermission(sql, conn.permissions, conn.type);
  const driver = await acquireDriver(conn);
  try {
    const result = await driver.query(sql);
    return textResult({
      ok: true,
      table: args.table,
      rowCount: result.rowCount,
      fields: result.fields,
      rows: result.rows,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (e) {
    return errorResult(`采样失败: ${translateDbError(e, conn.type)}`);
  }
}

export async function toolCount(args: {
  dbId: string;
  table: string;
  where?: string;
}): Promise<McpToolResult> {
  const conn = requireConnection(args.dbId);
  const where = args.where ? ` WHERE ${args.where}` : '';
  const sql = `SELECT COUNT(*) AS cnt FROM ${quoteQualifiedTable(args.table, conn.schema, conn.type)}${where}`;
  checkSqlPermission(sql, conn.permissions, conn.type);
  const driver = await acquireDriver(conn);
  try {
    const result = await driver.query(sql);
    return textResult({
      ok: true,
      table: args.table,
      count: Number(result.rows[0]?.cnt ?? 0),
      executionTimeMs: result.executionTimeMs,
    });
  } catch (e) {
    return errorResult(`统计失败: ${translateDbError(e, conn.type)}`);
  }
}

export async function toolExecute(args: {
  dbId: string;
  sql: string;
  limit?: number;
  dryRun?: boolean;
  continueOnError?: boolean;
}): Promise<McpToolResult> {
  if (!args.sql || !args.sql.trim()) {
    return errorResult('SQL 不能为空');
  }
  const conn = requireConnection(args.dbId);
  const limit = Math.min(args.limit ?? 50, 500);
  const driver = await acquireDriver(conn);
  try {
    const batch = await runSqlBatch(driver, conn, args.sql, {
      limit,
      dryRun: args.dryRun === true,
      stopOnError: args.continueOnError !== true,
    });
    return textResult({
      ok: batch.failed === 0,
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
    return errorResult(`执行失败: ${(e as Error).message}`);
  }
}

export async function toolExplain(args: {
  dbId: string;
  sql: string;
  analyze?: boolean;
}): Promise<McpToolResult> {
  if (!args.sql || !args.sql.trim()) {
    return errorResult('SQL 不能为空');
  }
  const conn = requireConnection(args.dbId);
  const cleanSql = args.sql.replace(/^\s*EXPLAIN\s+(ANALYZE\s+)?/i, '').trim();
  if (args.analyze) {
    checkSqlPermission(cleanSql, conn.permissions, conn.type);
  } else if (!conn.permissions.dmlQuery) {
    return errorResult('EXPLAIN 需要开启 SELECT 权限');
  }
  const explainSql =
    conn.type === 'mysql'
      ? `EXPLAIN${args.analyze ? ' ANALYZE' : ''} ${cleanSql}`
      : `EXPLAIN${args.analyze ? ' ANALYZE' : ''} ${cleanSql}`;
  const driver = await acquireDriver(conn);
  try {
    const result = await driver.query(explainSql);
    return textResult({
      ok: true,
      analyze: args.analyze === true,
      executionTimeMs: result.executionTimeMs,
      fields: result.fields,
      rows: result.rows,
    });
  } catch (e) {
    return errorResult(`EXPLAIN 失败: ${translateDbError(e, conn.type)}`);
  }
}
