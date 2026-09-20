import { existsSync, readFileSync } from 'fs';

import { closeConfigDb, getConnection, upsertConnection } from '../store/configStore.js';
import { decryptWithPassphrase } from '../utils/crypto.js';
import type { DbPermissions, DbType } from '../db/types.js';

interface ExportedConnection {
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
}

interface ExportPayload {
  version: number;
  exportedAt?: string;
  connections: ExportedConnection[];
}

export interface ImportOptions {
  passphrase: string;
  replace: boolean;
  yes: boolean;
  json: boolean;
}

export async function runImport(file: string, options: ImportOptions): Promise<void> {
  if (!options.passphrase) {
    throw new Error('必须提供 --passphrase');
  }
  if (!existsSync(file)) {
    throw new Error(`文件不存在: ${file}`);
  }

  let blob: Buffer;
  try {
    blob = readFileSync(file);
  } catch (e) {
    throw new Error(`读取失败: ${(e as Error).message}`);
  }

  let decrypted: Buffer;
  try {
    decrypted = decryptWithPassphrase(blob, options.passphrase);
  } catch (e) {
    throw new Error(
      `解密失败: ${(e as Error).message}\n可能原因：passphrase 错误，或文件不是 db-driver export 文件`
    );
  }

  let payload: ExportPayload;
  try {
    payload = JSON.parse(decrypted.toString('utf8')) as ExportPayload;
  } catch (e) {
    throw new Error(`导出文件 JSON 解析失败: ${(e as Error).message}`);
  }

  if (!Array.isArray(payload.connections)) {
    throw new Error('导出文件结构错误（缺少 connections）');
  }

  if (!options.yes) {
    console.log(
      `即将导入 ${payload.connections.length} 个连接${options.replace ? '（替换现有同 dbId）' : '（跳过同 dbId 冲突）'}:`
    );
    for (const c of payload.connections) {
      const flag = getConnection(c.dbId) ? (options.replace ? '↻ 替换' : '⚠ 跳过') : '+ 新增';
      console.log(`  ${flag}  ${c.dbId}  ${c.type}://${c.user}@${c.host}:${c.port}/${c.database}`);
    }
    console.log(`(加 --yes 跳过确认)`);
  }

  let imported = 0;
  let skipped = 0;
  for (const c of payload.connections) {
    const existing = getConnection(c.dbId);
    if (existing && !options.replace) {
      skipped++;
      continue;
    }
    upsertConnection({
      dbId: c.dbId,
      type: c.type,
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      database: c.database,
      schema: c.schema,
      description: c.description,
      permissions: c.permissions,
    });
    imported++;
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          file,
          total: payload.connections.length,
          imported,
          skipped,
          mode: options.replace ? 'replace' : 'skip-conflicts',
        },
        null,
        2
      )
    );
  } else {
    console.log(`\n✅ 导入完成：成功 ${imported}，跳过 ${skipped}（总 ${payload.connections.length}）`);
  }
  closeConfigDb();
}