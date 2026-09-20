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
  schema?: string;
  description?: string;
  permissions: DbPermissions;
  test?: boolean;
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
    schema: input.schema,
    description: input.description,
    permissions: input.permissions,
  });

  const endpoint = `${saved.type}://${saved.user}@${saved.host}:${saved.port}/${saved.database}${saved.schema ? ` (schema=${saved.schema})` : ''}`;
  console.log(`✅ 已保存连接 "${saved.dbId}" → ${endpoint}`);
  if (saved.description) console.log(`   描述: ${saved.description}`);
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