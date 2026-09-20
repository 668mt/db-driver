import pg from 'pg';
import type { DbConnectionConfig, QueryResult, SchemaTable, TableIndex, TableInfo } from './types.js';
import { mapColumns, type DbDriver } from './index.js';

export function createPostgresDriver(config: DbConnectionConfig): DbDriver {
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 10_000,
  });

  let connected = false;
  async function ensureConnected(): Promise<void> {
    if (!connected) {
      await client.connect();
      connected = true;
    }
  }

  function activeSchema(override?: string): string {
    return override ?? config.schema ?? 'public';
  }

  return {
    async testConnection(): Promise<void> {
      await ensureConnected();
      await client.query('SELECT 1');
    },

    async close(): Promise<void> {
      if (connected) {
        await client.end();
        connected = false;
      }
    },

    async query(sql: string): Promise<QueryResult> {
      await ensureConnected();
      const start = Date.now();
      const result = await client.query(sql);
      const executionTimeMs = Date.now() - start;

      const fields = result.fields.map((f) => f.name);
      const rows = result.rows as Record<string, unknown>[];

      return {
        rows,
        fields,
        rowCount: result.rowCount ?? rows.length,
        affectedRows: result.rowCount ?? undefined,
        executionTimeMs,
      };
    },

    async listTables(options?: {
      schema?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }): Promise<TableInfo[]> {
      await ensureConnected();
      const targetSchema = activeSchema(options?.schema);
      const where: string[] = ['n.nspname = $1', "c.relkind = 'r'"];
      const params: unknown[] = [targetSchema];
      if (options?.search) {
        where.push('c.relname LIKE $2');
        params.push(`%${options.search}%`);
      }

      let sql = `SELECT c.relname AS "tableName",
                        obj_description(c.oid, 'pg_class') AS "tableComment"
                 FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE ${where.join(' AND ')}
                 ORDER BY c.relname`;
      if (options?.limit !== undefined) {
        const limit = Math.max(0, Math.floor(options.limit));
        const offset = Math.max(0, Math.floor(options.offset ?? 0));
        sql += ` LIMIT ${limit} OFFSET ${offset}`;
      }

      const result = await client.query(sql, params);
      return result.rows.map<TableInfo>((r) => ({
        tableName: r.tableName as string,
        tableComment: (r.tableComment as string) ?? '',
      }));
    },

    async getTable(name: string, schema?: string): Promise<SchemaTable | null> {
      await ensureConnected();
      const targetSchema = activeSchema(schema);
      const tableResult = await client.query(
        `SELECT c.relname AS "tableName",
                obj_description(c.oid, 'pg_class') AS "tableComment"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'`,
        [targetSchema, name]
      );
      if (tableResult.rows.length === 0) return null;

      const columnsResult = await client.query(
        `SELECT c.relname AS "tableName",
                a.attname AS "columnName",
                format_type(a.atttypid, a.atttypmod) AS "dataType",
                NOT a.attnotnull AS "isNullable",
                pg_get_expr(d.adbin, d.adrelid) AS "columnDefault",
                '' AS "columnKey",
                col_description(c.oid, a.attnum) AS "columnComment"
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE n.nspname = $1 AND c.relname = $2
           AND a.attnum > 0
           AND NOT a.attisdropped
           AND c.relkind = 'r'
         ORDER BY a.attnum`,
        [targetSchema, name]
      );

      const indexResult = await client.query(
        `SELECT i.relname AS "indexName",
                a.attname AS "columnName",
                (array_position(ix.indkey, a.attnum)) AS "seqInIndex",
                ix.indisunique AS "isUnique",
                ix.indisprimary AS "isPrimary",
                am.amname AS "indexType",
                '' AS "comment"
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_am am ON am.oid = i.relam
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
         WHERE n.nspname = $1 AND t.relname = $2
         ORDER BY i.relname, array_position(ix.indkey, a.attnum)`,
        [targetSchema, name]
      );

      const indexes = indexResult.rows.map<TableIndex>((r) => ({
        indexName: r.indexName as string,
        columnName: r.columnName as string,
        seqInIndex: Number(r.seqInIndex),
        isUnique: Boolean(r.isUnique),
        isPrimary: Boolean(r.isPrimary),
        indexType: (r.indexType as string) ?? '',
        comment: (r.comment as string) ?? '',
      }));

      return {
        tableName: tableResult.rows[0].tableName as string,
        tableComment: (tableResult.rows[0].tableComment as string) ?? '',
        columns: mapColumns(columnsResult.rows as Array<Record<string, unknown>>),
        indexes,
      };
    },

    async getSchema(database?: string, schema?: string): Promise<SchemaTable[]> {
      await ensureConnected();
      const targetDb = database ?? config.database;
      const targetSchema = activeSchema(schema);

      const tablesResult = await client.query(
        `SELECT c.relname AS "tableName",
                obj_description(c.oid, 'pg_class') AS "tableComment"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relkind = 'r'
         ORDER BY c.relname`,
        [targetSchema]
      );

      if (tablesResult.rows.length === 0) return [];

      const columnsResult = await client.query(
        `SELECT c.relname AS "tableName",
                a.attname AS "columnName",
                format_type(a.atttypid, a.atttypmod) AS "dataType",
                NOT a.attnotnull AS "isNullable",
                pg_get_expr(d.adbin, d.adrelid) AS "columnDefault",
                '' AS "columnKey",
                col_description(c.oid, a.attnum) AS "columnComment"
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE n.nspname = $1
           AND a.attnum > 0
           AND NOT a.attisdropped
           AND c.relkind = 'r'
         ORDER BY c.relname, a.attnum`,
        [targetSchema]
      );

      const colsByTable = new Map<string, ReturnType<typeof mapColumns>>();
      for (const col of mapColumns(columnsResult.rows as Array<Record<string, unknown>>)) {
        const arr = colsByTable.get(col.tableName) ?? [];
        arr.push(col);
        colsByTable.set(col.tableName, arr);
      }

      return tablesResult.rows.map<SchemaTable>((t: Record<string, unknown>) => ({
        tableName: t.tableName as string,
        tableComment: (t.tableComment as string) ?? '',
        columns: colsByTable.get(t.tableName as string) ?? [],
      }));
    },
  };
}