import { getConnection, closeConfigDb } from '../store/configStore.js';

export async function runShow(dbId: string, options: { json: boolean; revealPassword: boolean }): Promise<void> {
  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}\n运行 db-driver list 查看已配置的连接`);
  }

  const detail = {
    dbId: conn.dbId,
    type: conn.type,
    host: conn.host,
    port: conn.port,
    user: conn.user,
    database: conn.database,
    schema: conn.schema ?? null,
    description: conn.description ?? null,
    password: options.revealPassword ? conn.password : '••••••',
    permissions: conn.permissions,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  };

  if (options.json) {
    console.log(JSON.stringify(detail, null, 2));
    closeConfigDb();
    return;
  }

  console.log(`\n🔌 ${conn.dbId}\n`);
  console.log(`  类型:     ${conn.type}`);
  console.log(`  Host:     ${conn.host}`);
  console.log(`  Port:     ${conn.port}`);
  console.log(`  User:     ${conn.user}`);
  console.log(`  Password: ${options.revealPassword ? conn.password : '••••••'}`);
  console.log(`  Database: ${conn.database}${conn.schema ? ` (schema=${conn.schema})` : ''}`);
  if (conn.description) console.log(`  描述:     ${conn.description}`);
  console.log(`  权限:`);
  console.log(`    SELECT:           ${conn.permissions.dmlQuery ? '✅' : '❌'}`);
  console.log(`    INSERT/UPDATE:    ${conn.permissions.dmlUpdate ? '✅' : '❌'}`);
  console.log(`    DELETE:           ${conn.permissions.dmlDelete ? '✅' : '❌'}`);
  console.log(`    DDL:              ${conn.permissions.ddl ? '✅' : '❌'}`);
  console.log(`  创建:     ${conn.createdAt}`);
  console.log(`  更新:     ${conn.updatedAt}\n`);
  console.log(`(用 --reveal-password 显示明文密码，--json 输出 JSON)`);
  closeConfigDb();
}