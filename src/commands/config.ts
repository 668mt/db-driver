import open from 'open';
import { startConfigServer } from '../web/server.js';
import { closeConfigDb, getConnection, upsertConnection } from '../store/configStore.js';
import { createDriver } from '../db/index.js';
import { translateDbError } from '../utils/errors.js';
import type { DbPermissions, DbType } from '../db/types.js';

const DEFAULT_PORTS: Record<DbType, number> = {
  mysql: 3306,
  postgres: 5432,
};

export interface CliConfigInput {
  dbId: string;
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  permissions: DbPermissions;
  test?: boolean;
}

export async function runConfigWeb(): Promise<void> {
  const handle = await startConfigServer();
  console.log(`\n🌐  db-driver config server started`);
  console.log(`   URL: ${handle.url}`);
  console.log(`   在浏览器中打开该 URL 进行配置`);
  console.log(`   关闭浏览器窗口后自动退出\n`);

  let closed = false;
  const exit = (reason: string) => {
    if (closed) return;
    closed = true;
    console.log(`\n👋  ${reason}, 退出 db-driver config\n`);
    handle.shutdown().finally(() => {
      closeConfigDb();
      process.exit(0);
    });
  };

  handle.onLastClientGone(() => {
    setTimeout(() => {
      if (handle.port) exit('所有浏览器窗口已关闭');
    }, 500);
  });

  process.on('SIGINT', () => exit('收到 SIGINT 信号'));
  process.on('SIGTERM', () => exit('收到 SIGTERM 信号'));

  try {
    await open(handle.url, { wait: false });
  } catch {
    console.log('   (自动打开浏览器失败，请手动复制上面的 URL)');
  }

  await new Promise(() => {});
}

export async function runConfigCli(input: CliConfigInput): Promise<void> {
  const existing = getConnection(input.dbId);
  if (existing) {
    console.log(`ℹ️  连接 "${input.dbId}" 已存在，将被覆盖`);
  }

  if (input.test) {
    process.stdout.write(`🔌 测试连接... `);
    const driver = await createDriver(input as any);
    try {
      await driver.testConnection();
      process.stdout.write('✅\n');
    } catch (e) {
      process.stdout.write('❌\n');
      throw new Error(`连接测试失败: ${translateDbError(e, input.type)}`);
    } finally {
      await driver.close();
    }
  }

  const saved = upsertConnection({
    dbId: input.dbId,
    type: input.type,
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    database: input.database,
    permissions: input.permissions,
  });

  console.log(`✅ 已保存连接 "${saved.dbId}" → ${saved.type}://${saved.user}@${saved.host}:${saved.port}/${saved.database}`);
  console.log(`   权限: ${formatPermissions(saved.permissions)}`);
  closeConfigDb();
}

export function defaultPortFor(type: DbType): number {
  return DEFAULT_PORTS[type];
}

function formatPermissions(p: DbPermissions): string {
  const parts: string[] = [];
  if (p.dmlQuery) parts.push('SELECT');
  if (p.dmlUpdate) parts.push('INSERT/UPDATE');
  if (p.dmlDelete) parts.push('DELETE');
  if (p.ddl) parts.push('DDL');
  return parts.length === 0 ? '(无)' : parts.join(', ');
}