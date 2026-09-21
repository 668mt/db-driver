import { existsSync, writeFileSync } from 'fs';

import { closeConfigDb, listConnections } from '../store/configStore.js';
import { encryptWithPassphrase } from '../utils/crypto.js';
import type { DbConnectionConfig } from '../db/types.js';

export interface ExportOptions {
  passphrase: string;
  includePasswords: boolean;
  force: boolean;
  json: boolean;
}

interface ExportPayload {
  version: 1;
  exportedAt: string;
  connections: DbConnectionConfig[];
}

export async function runExport(file: string, options: ExportOptions): Promise<void> {
  if (options.passphrase && options.passphrase.length < 8) {
    throw new Error('--passphrase 至少 8 位（留空 = 不加密；填了才加密文件）');
  }
  if (!options.force && existsSync(file)) {
    throw new Error(`文件已存在: ${file}\n加 --force 覆盖`);
  }

  const all = listConnections();
  const connections: DbConnectionConfig[] = options.includePasswords
    ? all
    : all.map((c) => ({ ...c, password: '' }));

  const payload: ExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    connections,
  };

  const encrypted = encryptWithPassphrase(
    Buffer.from(JSON.stringify(payload), 'utf8'),
    options.passphrase
  );
  writeFileSync(file, encrypted);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          file,
          count: connections.length,
          includePasswords: options.includePasswords,
        },
        null,
        2
      )
    );
  } else {
    console.log(`✅ 已导出 ${connections.length} 个连接到 ${file}`);
    if (!options.includePasswords) {
      console.log(`   (--no-include-passwords：密码字段已脱敏为 "")`);
    }
  }
  closeConfigDb();
}
