import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { CONFIG_FILE } from '../utils/paths.js';
import { evictDriver } from '../db/pool.js';
import type { DbConnectionConfig, DbPermissions, DbType } from '../db/types.js';

const SCHEMA_VERSION = 1;

interface ConfigFile {
  version: number;
  connections: DbConnectionConfig[];
}

let cache: ConfigFile | null = null;

function emptyFile(): ConfigFile {
  return { version: SCHEMA_VERSION, connections: [] };
}

function load(): ConfigFile {
  if (cache) return cache;
  if (!existsSync(CONFIG_FILE)) {
    cache = emptyFile();
    return cache;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ConfigFile>;
    if (!parsed || typeof parsed !== 'object') {
      cache = emptyFile();
      return cache;
    }
    cache = {
      version: SCHEMA_VERSION,
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
    };
    return cache;
  } catch {
    cache = emptyFile();
    return cache;
  }
}

function persist(): void {
  if (!cache) return;
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  renameSync(tmp, CONFIG_FILE);
}

function now(): string {
  return new Date().toISOString();
}

export function listConnections(): DbConnectionConfig[] {
  return [...load().connections].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getConnection(dbId: string): DbConnectionConfig | null {
  return load().connections.find((c) => c.dbId === dbId) ?? null;
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
  permissions: DbPermissions;
}): DbConnectionConfig {
  const file = load();
  const idx = file.connections.findIndex((c) => c.dbId === input.dbId);
  const updatedAt = now();
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