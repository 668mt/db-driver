import { createDriver, type DbDriver } from './index.js';
import type { DbConnectionConfig } from './types.js';

interface PoolEntry {
  driver: DbDriver;
  expiresAt: number;
  dbId: string;
}

const DEFAULT_TTL_MS = 30_000;

const cache = new Map<string, PoolEntry>();
let sweeper: NodeJS.Timeout | null = null;
let cleanupRegistered = false;

function startSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [dbId, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(dbId);
        entry.driver.close().catch(() => {});
      }
    }
    if (cache.size === 0 && sweeper) {
      clearInterval(sweeper);
      sweeper = null;
    }
  }, 10_000);
  sweeper.unref();
}

function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  // 关键：beforeExit 钩子允许异步清理，Node 会等待 Promise 完成后再退出
  process.on('beforeExit', async () => {
    const entries = Array.from(cache.values());
    cache.clear();
    await Promise.allSettled(entries.map((e) => e.driver.close()));
    if (sweeper) {
      clearInterval(sweeper);
      sweeper = null;
    }
  });

  const forceExit = (): void => {
    for (const entry of cache.values()) {
      entry.driver.close().catch(() => {});
    }
    cache.clear();
    if (sweeper) {
      clearInterval(sweeper);
      sweeper = null;
    }
  };
  process.on('SIGINT', () => {
    forceExit();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    forceExit();
    process.exit(0);
  });
}

export async function acquireDriver(
  config: DbConnectionConfig,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<DbDriver> {
  const now = Date.now();
  const cached = cache.get(config.dbId);
  if (cached && cached.expiresAt > now) {
    cached.expiresAt = now + ttlMs;
    startSweeper();
    return cached.driver;
  }
  if (cached) {
    cache.delete(config.dbId);
    cached.driver.close().catch(() => {});
  }
  const driver = await createDriver(config);
  cache.set(config.dbId, {
    driver,
    dbId: config.dbId,
    expiresAt: now + ttlMs,
  });
  startSweeper();
  registerCleanup();
  return driver;
}

export function releaseDriver(_dbId: string): void {
  // 当前模型下不主动 close，由 TTL/sweeper/beforeExit 负责回收
  void _dbId;
}

export function evictDriver(dbId: string): void {
  const entry = cache.get(dbId);
  if (!entry) return;
  cache.delete(dbId);
  entry.driver.close().catch(() => {});
}

export function clearPool(): void {
  for (const entry of cache.values()) {
    entry.driver.close().catch(() => {});
  }
  cache.clear();
  if (sweeper) {
    clearInterval(sweeper);
    sweeper = null;
  }
}

export function poolStats(): { size: number; entries: Array<{ dbId: string; ttlMs: number }> } {
  const now = Date.now();
  return {
    size: cache.size,
    entries: Array.from(cache.values()).map((e) => ({
      dbId: e.dbId,
      ttlMs: Math.max(0, e.expiresAt - now),
    })),
  };
}