import { getConnection, closeConfigDb } from '../store/configStore.js';
import { acquireDriver } from '../db/pool.js';
import { translateDbError } from '../utils/errors.js';

export async function runTest(dbId: string): Promise<void> {
  const conn = getConnection(dbId);
  if (!conn) {
    throw new Error(`数据库连接不存在: ${dbId}`);
  }

  const start = Date.now();
  const driver = await acquireDriver(conn);
  try {
    await driver.testConnection();
    const elapsed = Date.now() - start;
    console.log(`✅ 连接成功 (${elapsed}ms)`);
    process.exitCode = 0;
  } catch (e) {
    console.log(`❌ 连接失败: ${translateDbError(e, conn.type)}`);
    process.exitCode = 1;
  } finally {
    closeConfigDb();
  }
}