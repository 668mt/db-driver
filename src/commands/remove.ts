import { deleteConnection, getConnection, closeConfigDb } from '../store/configStore.js';

export async function runRemove(dbId: string, options: { yes: boolean }): Promise<void> {
  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}`);
  }

  if (!options.yes) {
    console.log(`即将删除连接 "${dbId}" (${conn.type}://${conn.user}@${conn.host}:${conn.port}/${conn.database})`);
    console.log('此操作不可撤销。确认请加 --yes 参数。');
    process.exitCode = 2;
    closeConfigDb();
    return;
  }

  const ok = deleteConnection(dbId);
  if (ok) {
    console.log(`✅ 已删除连接 "${dbId}"`);
  } else {
    console.log(`❌ 删除失败: ${dbId}`);
    process.exitCode = 1;
  }
  closeConfigDb();
}