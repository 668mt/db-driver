import { getConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import type { DbDriver } from '../db/index.js';

export interface SchemaOptions {
  table?: string;
  search?: string;
  schema?: string;
  limit?: number;
  offset: number;
  json: boolean;
  showPartitions?: boolean;
}

export async function runSchema(dbId: string, options: SchemaOptions): Promise<void> {
  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}\n请先运行 db-driver config 配置连接`);
  }

  const driver = await acquireDriver(conn);
  try {
    if (options.table) {
      await showTableDetail(driver, options.table, options.schema, options);
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
  const offset = options.offset ?? 0;
  const { tables, total } = await driver.listTables({
    schema: options.schema,
    search: options.search,
    limit,
    offset,
  });

  if (options.json) {
    console.log(
      JSON.stringify({ database, total, shown: tables.length, offset, limit, tables }, null, 2)
    );
    return;
  }

  if (tables.length === 0 && offset === 0) {
    console.log(`数据库 ${database} 中没有表${options.search ? `（匹配 "${options.search}"）` : ''}`);
    return;
  }

  if (tables.length === 0) {
    console.log(`(offset=${offset} 已超出，共 ${total} 张表)`);
    return;
  }

  const nameWidth = Math.max(4, ...tables.map((t) => t.tableName.length));
  const start = offset + 1;
  const end = offset + tables.length;
  console.log(
    `\n📋 数据库 ${database} — ${total} 张表（${start}-${end}/${total}, offset=${offset}, limit=${limit}）\n`
  );
  console.log('Table'.padEnd(nameWidth + 2) + 'Comment');
  console.log('-'.repeat(Math.min(80, nameWidth + 2 + 40)));
  for (const t of tables) {
    const comment = t.tableComment || '';
    console.log(t.tableName.padEnd(nameWidth + 2) + comment);
  }
  const nextOffset = end < total ? offset + limit : null;
  console.log(`\n操作:`);
  if (nextOffset !== null) {
    console.log(`  还有 ${total - end} 张未显示 → db-driver schema <dbId> --offset ${nextOffset}`);
  }
  if (offset > 0) {
    console.log(`  回到第一页 → db-driver schema <dbId> --offset 0`);
  }
  console.log(`  查看单表 → db-driver schema <dbId> --table <name>`);
  console.log(`  按名过滤 → db-driver schema <dbId> --search <kw>`);
}

async function showTableDetail(
  driver: DbDriver,
  tableName: string,
  schema: string | undefined,
  options: SchemaOptions
): Promise<void> {
  const table = await driver.getTable(tableName, schema);
  if (!table) {
    throw new Error(`表不存在: ${tableName}`);
  }

  if (options.json) {
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

  if (table.partitions && table.partitions.length > 0) {
    if (options.showPartitions) {
      console.log(`\n🧩 分区 (${table.partitions.length})\n`);
      const partHeader = ['Name'.padEnd(32), 'Description'.padEnd(20), 'Rows'.padEnd(12), 'Data (B)'];
      console.log(partHeader.join(' '));
      console.log('-'.repeat(80));
      for (const p of table.partitions) {
        const line = [
          p.partitionName.padEnd(32),
          p.partitionDescription.padEnd(20),
          String(p.tableRows).padEnd(12),
          String(p.dataLength),
        ];
        console.log(line.join(' '));
      }
    } else {
      console.log(`\n🧩 分区: ${table.partitions.length} 个（加 --show-partitions 查看）`);
    }
  }
}