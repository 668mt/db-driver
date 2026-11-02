import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { Entry } from '@napi-rs/keyring';

import { CONFIG_DIR } from '../utils/paths.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { evictDriver } from '../db/pool.js';
import type { DbConnectionConfig, DbPermissions, DbType } from '../db/types.js';

const SCHEMA_VERSION = 1;
const CONFIG_FILE = join(CONFIG_DIR, 'config.bin');
const OLD_PLAIN_FILE = join(CONFIG_DIR, 'config.json');
const KEYRING_SERVICE = 'db-driver';
const KEYRING_ACCOUNT = 'master-key';

interface ConfigFile {
  version: number;
  connections: DbConnectionConfig[];
}

let cache: ConfigFile | null = null;
let masterKey: Buffer | null = null;

function warnIfLegacyPlainFile(): void {
  if (existsSync(OLD_PLAIN_FILE)) {
    console.warn(
      `⚠️  检测到旧明文配置文件 ${OLD_PLAIN_FILE}。\n` +
        `   新版已改用加密存储（${CONFIG_FILE}），旧文件请手动删除以避免密码泄露。\n` +
        `   删除前可先运行 db-driver list 确认新加密文件已正确加载。`
    );
  }
}

function loadMasterKey(): Buffer {
  if (masterKey) return masterKey;
  const entry = new Entry(KEYRING_SERVICE, KEYRING_ACCOUNT);
  let stored: string | null = null;
  try {
    stored = entry.getPassword();
  } catch (e) {
    throw new Error(
      `OS keyring 不可用：${(e as Error).message}\n` +
        `db-driver 用系统级 keyring（Windows DPAPI / macOS Keychain / Linux Secret Service）保护 master key。\n` +
        `请检查系统 keyring 服务是否在运行。`
    );
  }
  if (!stored) {
    const newKey = randomBytes(32);
    try {
      entry.setPassword(newKey.toString('base64'));
    } catch (e) {
      throw new Error(
        `无法保存 master key 到系统 keyring：${(e as Error).message}\n` +
          `db-driver 用系统级 keyring 保护配置；如拒绝，请检查 keychain 权限。`
      );
    }
    stored = newKey.toString('base64');
  }
  masterKey = Buffer.from(stored, 'base64');
  return masterKey;
}

function emptyFile(): ConfigFile {
  return { version: SCHEMA_VERSION, connections: [] };
}

function load(): ConfigFile {
  if (cache) return cache;
  warnIfLegacyPlainFile();
  if (!existsSync(CONFIG_FILE)) {
    cache = emptyFile();
    return cache;
  }
  let blob: Buffer;
  try {
    blob = readFileSync(CONFIG_FILE);
  } catch (e) {
    throw new Error(`配置读取失败：${(e as Error).message}`);
  }
  let decrypted: Buffer;
  try {
    decrypted = decrypt(blob, loadMasterKey());
  } catch (e) {
    throw new Error(
      `配置解密失败：${(e as Error).message}\n` +
        `常见原因：\n` +
        `  - 系统重装 / 换用户后 keyring 里的 master key 已丢失\n` +
        `  - 配置文件被其他程序修改\n` +
        `解决：删除 ${CONFIG_FILE} 并重新 db-driver config（之前保存的连接会丢失）`
    );
  }
  try {
    const parsed = JSON.parse(decrypted.toString('utf8')) as Partial<ConfigFile>;
    if (!parsed || typeof parsed !== 'object') {
      cache = emptyFile();
      return cache;
    }
    cache = {
      version: SCHEMA_VERSION,
      connections: Array.isArray(parsed.connections)
        ? parsed.connections.map((c) => ({ ...c, enabled: c.enabled !== false }))
        : [],
    };
    return cache;
  } catch (e) {
    throw new Error(`配置 JSON 解析失败：${(e as Error).message}`);
  }
}

function persist(): void {
  if (!cache) return;
  mkdirSync(CONFIG_DIR, { recursive: true });
  const json = JSON.stringify(cache);
  const encrypted = encrypt(Buffer.from(json, 'utf8'), loadMasterKey());
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, encrypted);
  renameSync(tmp, CONFIG_FILE);
}

function now(): string {
  return new Date().toISOString();
}

export function listConnections(): DbConnectionConfig[] {
  return [...load().connections].sort((a, b) => a.dbId.localeCompare(b.dbId));
}

export function getConnection(dbId: string): DbConnectionConfig | null {
  return load().connections.find((c) => c.dbId === dbId) ?? null;
}

/**
 * 取一个**已启用**的连接。被禁用的连接一律拒绝数据访问。
 * 这是「禁用连接」的唯一强制入口 —— 所有会碰数据库的命令都必须走它。
 */
export function getEnabledConnection(dbId: string): DbConnectionConfig | null {
  const conn = getConnection(dbId);
  if (!conn) return null;
  if (conn.enabled === false) {
    throw new Error(
      `数据库连接已被禁用: ${dbId}\n` +
        `如需启用：db-driver enable ${dbId}\n` +
        `（禁用的连接只是锁住数据访问，配置本身仍在）`
    );
  }
  return conn;
}

export function upsertConnection(input: {
  dbId: string;
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema?: string;
  description?: string;
  /** 不传则保留已有的启用状态（避免编辑连接时意外把禁用的连接打开） */
  enabled?: boolean;
  permissions: DbPermissions;
}): DbConnectionConfig {
  const file = load();
  const idx = file.connections.findIndex((c) => c.dbId === input.dbId);
  const updatedAt = now();
  const prevEnabled = idx >= 0 ? file.connections[idx].enabled : undefined;
  const next: DbConnectionConfig = {
    dbId: input.dbId,
    type: input.type,
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    database: input.database,
    schema: input.schema?.trim() || undefined,
    description: input.description?.trim() || undefined,
    enabled: input.enabled ?? prevEnabled ?? true,
    permissions: input.permissions,
    createdAt: idx >= 0 ? file.connections[idx].createdAt : updatedAt,
    updatedAt,
  };
  if (idx >= 0) file.connections[idx] = next;
  else file.connections.push(next);
  persist();
  evictDriver(input.dbId);
  return next;
}

/**
 * 启用 / 禁用一个连接。
 * 返回变更后的连接；dbId 不存在返回 null。
 */
export function setConnectionEnabled(dbId: string, enabled: boolean): DbConnectionConfig | null {
  const file = load();
  const conn = file.connections.find((c) => c.dbId === dbId);
  if (!conn) return null;
  conn.enabled = enabled;
  conn.updatedAt = now();
  persist();
  evictDriver(dbId);
  return conn;
}

export function deleteConnection(dbId: string): boolean {
  const file = load();
  const before = file.connections.length;
  file.connections = file.connections.filter((c) => c.dbId !== dbId);
  if (file.connections.length === before) return false;
  persist();
  evictDriver(dbId);
  return true;
}

export function resetCache(): void {
  cache = null;
}

export function closeConfigDb(): void {
  resetCache();
}