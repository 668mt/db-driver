import mysql from 'mysql2/promise';
import type { DbConnectionConfig, QueryResult, SchemaTable, TableIndex, TableInfo } from './types.js';
import { mapColumns, type DbDriver } from './index.js';

export function createMysqlDriver(config: DbConnectionConfig): DbDriver {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 5,
    multipleStatements: false,
  });

  return {
    async testConnection(): Promise<void> {
      const conn = await pool.getConnection();
      try {
        await conn.ping();
      } finally {
        conn.release();
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },

    async query(sql: string): Promise<QueryResult> {
      const start = Date.now();
      const conn = await pool.getConnection();
      try {
        const [result] = await conn.query(sql);
        const executionTimeMs = Date.now() - start;

        if (Array.isArray(result)) {
          const fields =
            result.length > 0 && typeof result[0] === 'object'
              ? Object.keys(result[0] as Record<string, unknown>)
              : [];
          return {
            rows: result as Record<string, unknown>[],
            fields,
            rowCount: result.length,
            executionTimeMs,
          };
        }

        const okPacket = result as mysql.ResultSetHeader;
        return {
          rows: [],
          fields: [],
          rowCount: 0,
          affectedRows: okPacket.affectedRows,
          executionTimeMs,
        };
      } finally {
        conn.release();
      }
    },

    async listTables(options?: {
      schema?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }): Promise<TableInfo[]> {
      const targetDb = config.database;
      const search = options?.search;
      const limit = options?.limit;
      const offset = options?.offset ?? 0;

      const where: string[] = ['TABLE_SCHEMA = ?', "TABLE_TYPE = 'BASE TABLE'"];
      const params: unknown[] = [targetDb];
      if (search) {
        where.push('TABLE_NAME LIKE ?');
        params.push(`%${search}%`);
      }

      let sql = `SELECT TABLE_NAME AS tableName, TABLE_COMMENT AS tableComment
                 FROM information_schema.TABLES
                 WHERE ${where.join(' AND ')}
                 ORDER BY TABLE_NAME`;
      if (limit !== undefined) {
        sql += ` LIMIT ${Math.max(0, Math.floor(limit))} OFFSET ${Math.max(0, Math.floor(offset))}`;
      }

      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(sql, params);
        return (rows as Array<Record<string, unknown>>).map<TableInfo>((r) => ({
          tableName: r.tableName as string,
          tableComment: (r.tableComment as string) ?? '',
        }));
      } finally {
        conn.release();
      }
    },

    async getTable(name: string, _schema?: string): Promise<SchemaTable | null> {
      const conn = await pool.getConnection();
      try {
        const [tableRows] = await conn.query(
          `SELECT TABLE_NAME AS tableName, TABLE_COMMENT AS tableComment
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'`,
          [config.database, name]
        );
        const tables = tableRows as Array<Record<string, unknown>>;
        if (tables.length === 0) return null;

        const [columnRows] = await conn.query(
          `SELECT TABLE_NAME AS tableName,
                  COLUMN_NAME AS columnName,
                  DATA_TYPE AS dataType,
                  IS_NULLABLE AS isNullable,
                  COLUMN_DEFAULT AS columnDefault,
                  IF(COLUMN_KEY = 'PRI', 'PRI', IF(COLUMN_KEY = 'UNI', 'UNI', '')) AS columnKey,
                  COLUMN_COMMENT AS columnComment
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [config.database, name]
        );

        const [indexRows] = await conn.query(
          `SELECT INDEX_NAME AS indexName,
                  COLUMN_NAME AS columnName,
                  SEQ_IN_INDEX AS seqInIndex,
                  NON_UNIQUE AS nonUnique,
                  (INDEX_NAME = 'PRIMARY') AS isPrimary,
                  INDEX_TYPE AS indexType,
                  INDEX_COMMENT AS comment
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
          [config.database, name]
        );

        const columns = mapColumns(columnRows as Array<Record<string, unknown>>);
        const indexes = (indexRows as Array<Record<string, unknown>>).map<TableIndex>((r) => ({
          indexName: r.indexName as string,
          columnName: r.columnName as string,
          seqInIndex: Number(r.seqInIndex),
          isUnique: !r.nonUnique,
          isPrimary: Boolean(r.isPrimary),
          indexType: (r.indexType as string) ?? '',
          comment: (r.comment as string) ?? '',
        }));

        return {
          tableName: tables[0].tableName as string,
          tableComment: (tables[0].tableComment as string) ?? '',
          columns,
          indexes,
        };
      } finally {
        conn.release();
      }
    },

    async getSchema(database?: string, _schema?: string): Promise<SchemaTable[]> {
      const targetDb = database ?? config.database;
      const conn = await pool.getConnection();
      try {
        const [tables] = await conn.query(
          `SELECT TABLE_NAME AS tableName, TABLE_COMMENT AS tableComment
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
           ORDER BY TABLE_NAME`,
          [targetDb]
        );

        const tableRows = tables as Array<Record<string, unknown>>;
        if (tableRows.length === 0) return [];

        const [columns] = await conn.query(
          `SELECT TABLE_NAME AS tableName,
                  COLUMN_NAME AS columnName,
                  DATA_TYPE AS dataType,
                  IS_NULLABLE AS isNullable,
                  COLUMN_DEFAULT AS columnDefault,
                  COLUMN_COMMENT AS columnComment,
                  IF(COLUMN_KEY = 'PRI', 'PRI', IF(COLUMN_KEY = 'UNI', 'UNI', '')) AS columnKey
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ?
           ORDER BY TABLE_NAME, ORDINAL_POSITION`,
          [targetDb]
        );

        const columnRows = columns as Array<Record<string, unknown>>;
        const colsByTable = new Map<string, ReturnType<typeof mapColumns>>();
        for (const col of mapColumns(columnRows)) {
          const arr = colsByTable.get(col.tableName) ?? [];
          arr.push(col);
          colsByTable.set(col.tableName, arr);
        }

        return tableRows.map<SchemaTable>((t) => ({
          tableName: t.tableName as string,
          tableComment: (t.tableComment as string) ?? '',
          columns: colsByTable.get(t.tableName as string) ?? [],
        }));
      } finally {
        conn.release();
      }
    },
  };
}