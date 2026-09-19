import { getConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { checkSqlPermission, SqlPermissionError } from '../db/permissions.js';
import { translateDbError } from '../utils/errors.js';
import { formatTable } from './sample.js';

export interface ExplainOptions {
  analyze: boolean;
  json: boolean;
}

export async function runExplain(dbId: string, sql: string, options: ExplainOptions): Promise<void> {
  if (!sql || !sql.trim()) {
    throw new Error('SQL 不能为空');
  }

  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}`);
  }

  // 解析原始 SQL 用于权限检查
  const cleanSql = stripExplain(sql);
  // 没有 ANALYZE 时只是计划，不执行；ANALYZE 才会真正执行
  if (options.analyze) {
    checkSqlPermission(cleanSql, conn.permissions, conn.type);
  } else {
    // 仅做计划也要求 dmlQuery（防止通过 EXPLAIN 探测任意表结构）
    if (!conn.permissions.dmlQuery) {
      throw new SqlPermissionError('EXPLAIN 需要开启 SELECT 权限', 'query');
    }
  }

  const explainSql = buildExplainSql(cleanSql, options, conn.type);
  const driver = await acquireDriver(conn);
  try {
    const result = await driver.query(explainSql);
    const executionTimeMs = result.executionTimeMs;

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            analyze: options.analyze,
            executionTimeMs,
            rows: result.rows,
            fields: result.fields,
          },
          null,
          2
        )
      );
      return;
    }

    if (result.rows.length === 0) {
      console.log('\n(无返回)');
      return;
    }

    const rowsForDisplay = options.analyze ? result.rows.slice(0, 200) : result.rows;
    console.log(
      `\n📐 EXPLAIN${options.analyze ? ' ANALYZE' : ''} (${executionTimeMs}ms)\n${explainSql}\n`
    );
    console.log(formatTable(rowsForDisplay));
    if (options.analyze && result.rows.length > 200) {
      console.log(`\n(还有 ${result.rows.length - 200} 行未显示，加 --json 看完整结果)`);
    }
  } catch (e) {
    if (e instanceof SqlPermissionError) throw e;
    throw new Error(`EXPLAIN 失败: ${translateDbError(e, conn.type)}`);
  } finally {
    closeConfigDb();
  }
}

function stripExplain(sql: string): string {
  return sql.replace(/^\s*EXPLAIN\s+(ANALYZE\s+)?/i, '').trim();
}

function buildExplainSql(innerSql: string, options: ExplainOptions, dbType: 'mysql' | 'postgres'): string {
  if (dbType === 'mysql') {
    const parts: string[] = ['EXPLAIN'];
    if (options.analyze) parts.push('ANALYZE');
    if (options.json) parts.push('FORMAT=JSON');
    parts.push(innerSql);
    return parts.join(' ');
  }
  // postgres
  if (options.json) {
    return `EXPLAIN (FORMAT JSON${options.analyze ? ', ANALYZE' : ''}) ${innerSql}`;
  }
  if (options.analyze) {
    return `EXPLAIN ANALYZE ${innerSql}`;
  }
  return `EXPLAIN ${innerSql}`;
}