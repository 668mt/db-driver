import { getConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import type { DbDriver } from '../db/index.js';

export interface SchemaOptions {
  table?: string;
  search?: string;
  limit?: number;
  offset: number;
  json: boolean;
}

export async function runSchema(dbId: string, options: SchemaOptions): Promise<void> {
  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}\n请先运行 db-driver config 配置连接`);
  }

  const driver = await acquireDriver(conn);
  try {
    if (options.table) {
      await showTableDetail(driver, options.table, options.json);
    } else {
      await showTableList(driver, conn.database, options);
    }
  } finally {
    closeConfigDb();
  }
}

async function showTableList(
  driver: DbDriver,
  database: string,
  options: SchemaOptions
): Promise<void> {
  const limit = options.limit ?? 50;
  const tables = await driver.listTables({
    search: options.search,
    limit,
    offset: options.offset,
  });

  if (options.json) {
    console.log(JSON.stringify({ database, count: tables.length, tables }, null, 2));
    return;
  }

  if (tables.length === 0) {
    console.log(`数据库 ${database} 中没有表${options.search ? `（匹配 "${options.search}"）` : ''}`);
    return;
  }

  const nameWidth = Math.max(4, ...tables.map((t) => t.tableName.length));
  console.log(`\n📋 数据库 ${database} — ${tables.length} 张表 (offset=${options.offset}, limit=${limit})\n`);
  console.log('Table'.padEnd(nameWidth + 2) + 'Comment');
  console.log('-'.repeat(Math.min(80, nameWidth + 2 + 40)));
  for (const t of tables) {
    const comment = t.tableComment || '';
    console.log(t.tableName.padEnd(nameWidth + 2) + comment);
  }
  console.log(`\n用法:`);
  console.log(`  db-driver schema ${database === '' ? '<dbId>' : '<dbId>'} --table <name>   # 查看单表字段`);
  console.log(`  db-driver schema ${database === '' ? '<dbId>' : '<dbId>'} --search user   # 按表名过滤`);
  console.log(`  db-driver schema ${database === '' ? '<dbId>' : '<dbId>'} --limit 200 --offset 0   # 分页`);
}

async function showTableDetail(
  driver: DbDriver,
  tableName: string,
  json: boolean
): Promise<void> {
  const table = await driver.getTable(tableName);
  if (!table) {
    throw new Error(`表不存在: ${tableName}`);
  }

  if (json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }

  console.log(`\n📦 ${table.tableName}${table.tableComment ? ' — ' + table.tableComment : ''}`);
  console.log('-'.repeat(Math.min(80, 32 + table.tableName.length)));
  const header = [
    'Column'.padEnd(28),
    'Type'.padEnd(22),
    'Null'.padEnd(6),
    'Default'.padEnd(14),
    'Key'.padEnd(6),
    'Comment',
  ];
  console.log(header.join(' '));
  console.log('-'.repeat(80));
  for (const col of table.columns) {
    const line = [
      col.columnName.padEnd(28),
      col.dataType.padEnd(22),
      (col.isNullable ? 'YES' : 'NO').padEnd(6),
      String(col.columnDefault ?? '').padEnd(14),
      (col.columnKey ?? '').padEnd(6),
      col.columnComment,
    ];
    console.log(line.join(' '));
  }
  console.log(`\n共 ${table.columns.length} 个字段`);

  if (table.indexes && table.indexes.length > 0) {
    console.log(`\n🔑 索引 (${table.indexes.length})\n`);
    const indexHeader = [
      'Name'.padEnd(32),
      'Column'.padEnd(24),
      'Seq'.padEnd(4),
      'Type'.padEnd(12),
      'Flags',
    ];
    console.log(indexHeader.join(' '));
    console.log('-'.repeat(80));
    for (const idx of table.indexes) {
      const flags: string[] = [];
      if (idx.isPrimary) flags.push('PRIMARY');
      if (idx.isUnique) flags.push('UNIQUE');
      const line = [
        idx.indexName.padEnd(32),
        idx.columnName.padEnd(24),
        String(idx.seqInIndex).padEnd(4),
        idx.indexType.padEnd(12),
        flags.join(', '),
      ];
      console.log(line.join(' '));
    }
    console.log(`\n加 --json 看完整结构（含 COMMENT / 复合索引列顺序）`);
  } else {
    console.log(`\n(无索引)`);
  }
}