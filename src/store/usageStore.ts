import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

import { USAGE_FILE } from '../utils/paths.js';

export interface UsageEntry {
  index: number;
  addedAt: string;
  dbIds: string[];
  title: string;
  content: string;
}

interface EntryRow {
  id: number;
  added_at: string;
  title: string;
  content: string;
}

interface EntryRowOld {
  id: number;
  added_at: string;
  db_id: string;
  title: string;
  content: string;
}

function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let dbInstance: Database.Database | null = null;

function migrateFromSingleDb(db: Database.Database): void {
  const old = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='usage_entries'`)
    .get() as { name: string } | undefined;
  if (!old) return;
  const cols = db.prepare(`PRAGMA table_info(usage_entries)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'db_id')) return;

  db.exec(`
    BEGIN TRANSACTION;
    CREATE TABLE usage_entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      added_at TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE TABLE usage_entry_dbs (
      entry_id INTEGER NOT NULL,
      db_id TEXT NOT NULL,
      PRIMARY KEY (entry_id, db_id),
      FOREIGN KEY (entry_id) REFERENCES usage_entries_new(id) ON DELETE CASCADE
    );
    INSERT INTO usage_entries_new (id, added_at, title, content)
      SELECT id, added_at, title, content FROM usage_entries;
    INSERT INTO usage_entry_dbs (entry_id, db_id)
      SELECT id, db_id FROM usage_entries WHERE db_id IS NOT NULL AND db_id != '';
    DROP TABLE usage_entries;
    ALTER TABLE usage_entries_new RENAME TO usage_entries;
    CREATE INDEX idx_usage_entry_dbs_db_id ON usage_entry_dbs(db_id);
    CREATE INDEX idx_usage_added_at ON usage_entries(added_at DESC);
    COMMIT;
  `);
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  mkdirSync(dirname(USAGE_FILE), { recursive: true });
  const db = new Database(USAGE_FILE);
  db.pragma('journal_mode = WAL');
  migrateFromSingleDb(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      added_at TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage_entry_dbs (
      entry_id INTEGER NOT NULL,
      db_id TEXT NOT NULL,
      PRIMARY KEY (entry_id, db_id),
      FOREIGN KEY (entry_id) REFERENCES usage_entries(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_usage_entry_dbs_db_id ON usage_entry_dbs(db_id);
    CREATE INDEX IF NOT EXISTS idx_usage_added_at ON usage_entries(added_at DESC);
  `);
  dbInstance = db;
  return db;
}

function rowToEntry(row: EntryRow, dbIds: string[]): UsageEntry {
  return {
    index: row.id,
    addedAt: row.added_at,
    dbIds,
    title: row.title,
    content: row.content,
  };
}

export function listUsage(
  dbId?: string,
  keyword?: string,
  limit?: number,
  offset: number = 0
): { total: number; entries: UsageEntry[] } {
  const db = getDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (dbId && dbId.trim()) {
    conds.push('EXISTS (SELECT 1 FROM usage_entry_dbs WHERE entry_id = e.id AND db_id = ?)');
    params.push(dbId.trim());
  }
  if (keyword && keyword.trim()) {
    conds.push(`(
      LOWER(e.title) LIKE ?
      OR LOWER(e.content) LIKE ?
      OR EXISTS (SELECT 1 FROM usage_entry_dbs WHERE entry_id = e.id AND LOWER(db_id) LIKE ?)
    )`);
    const k = `%${keyword.toLowerCase()}%`;
    params.push(k, k, k);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const totalRow = db.prepare(
    `SELECT COUNT(*) AS c FROM usage_entries e ${where}`
  ).get(...params) as { c: number };
  const total = totalRow.c;
  const pageParams = [...params];
  let limitClause = '';
  if (limit && limit > 0) {
    limitClause = `LIMIT ? OFFSET ?`;
    pageParams.push(limit, offset);
  }
  const rows = db
    .prepare(
      `SELECT e.id, e.added_at, e.title, e.content FROM usage_entries e ${where} ORDER BY e.id DESC ${limitClause}`
    )
    .all(...pageParams) as EntryRow[];
  if (rows.length === 0) return { total, entries: [] };
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const dbRows = db
    .prepare(
      `SELECT entry_id, db_id FROM usage_entry_dbs WHERE entry_id IN (${placeholders}) ORDER BY db_id`
    )
    .all(...ids) as Array<{ entry_id: number; db_id: string }>;
  const dbsByEntry = new Map<number, string[]>();
  for (const r of dbRows) {
    if (!dbsByEntry.has(r.entry_id)) dbsByEntry.set(r.entry_id, []);
    dbsByEntry.get(r.entry_id)!.push(r.db_id);
  }
  const entries = rows.map((r) => rowToEntry(r, dbsByEntry.get(r.id) ?? []));
  return { total, entries };
}

export function addUsage(title: string, content: string, dbIds: string[]): UsageEntry {
  const cleaned = Array.from(new Set(dbIds.map((s) => s.trim()).filter(Boolean)));
  if (cleaned.length === 0) {
    throw new Error('dbIds 不能为空（用法必须绑定到至少一个数据库连接）');
  }
  if (!title || !title.trim()) throw new Error('标题不能为空');
  if (!content || !content.trim()) throw new Error('笔记内容不能为空');
  const db = getDb();
  const ts = now();
  const insertEntry = db.prepare(
    `INSERT INTO usage_entries (added_at, title, content) VALUES (?, ?, ?)`
  );
  const insertDb = db.prepare(
    `INSERT OR IGNORE INTO usage_entry_dbs (entry_id, db_id) VALUES (?, ?)`
  );
  const txn = db.transaction(() => {
    const r = insertEntry.run(ts, title.trim(), content.trim());
    const entryId = Number(r.lastInsertRowid);
    for (const id of cleaned) insertDb.run(entryId, id);
    return entryId;
  });
  const entryId = txn();
  return {
    index: entryId,
    addedAt: ts,
    dbIds: cleaned,
    title: title.trim(),
    content: content.trim(),
  };
}

export function clearUsage(dbId?: string): number {
  const db = getDb();
  let result: Database.RunResult;
  if (dbId && dbId.trim()) {
    const ids = db
      .prepare(`SELECT DISTINCT entry_id FROM usage_entry_dbs WHERE db_id = ?`)
      .all(dbId.trim()) as Array<{ entry_id: number }>;
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    result = db.prepare(`DELETE FROM usage_entries WHERE id IN (${placeholders})`).run(...ids.map((i) => i.entry_id));
  } else {
    result = db.prepare(`DELETE FROM usage_entries`).run();
    try {
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'usage_entries'`).run();
    } catch {
      /* ignore */
    }
  }
  return Number(result.changes);
}

export function getUsage(index: number): UsageEntry | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, added_at, title, content FROM usage_entries WHERE id = ?`)
    .get(index) as EntryRow | undefined;
  if (!row) return null;
  const dbRows = db
    .prepare(`SELECT db_id FROM usage_entry_dbs WHERE entry_id = ? ORDER BY db_id`)
    .all(index) as Array<{ db_id: string }>;
  return rowToEntry(row, dbRows.map((r) => r.db_id));
}

export function removeUsage(index: number): UsageEntry | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, added_at, title, content FROM usage_entries WHERE id = ?`)
    .get(index) as EntryRow | undefined;
  if (!row) return null;
  const dbRows = db
    .prepare(`SELECT db_id FROM usage_entry_dbs WHERE entry_id = ?`)
    .all(index) as Array<{ db_id: string }>;
  db.prepare(`DELETE FROM usage_entries WHERE id = ?`).run(index);
  return rowToEntry(row, dbRows.map((r) => r.db_id));
}

export function updateUsage(
  index: number,
  title: string | undefined,
  content: string | undefined,
  dbIds: string[] | undefined
): UsageEntry | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, added_at, title, content FROM usage_entries WHERE id = ?`)
    .get(index) as EntryRow | undefined;
  if (!row) return null;
  const finalTitle = (title ?? row.title).trim();
  const finalContent = (content ?? row.content).trim();
  if (!finalTitle) throw new Error('标题不能为空');
  if (!finalContent) throw new Error('笔记内容不能为空');
  const oldDbRows = db
    .prepare(`SELECT db_id FROM usage_entry_dbs WHERE entry_id = ?`)
    .all(index) as Array<{ db_id: string }>;
  const oldDbIds = oldDbRows.map((r) => r.db_id);
  const finalDbIds =
    dbIds !== undefined
      ? Array.from(new Set(dbIds.map((s) => s.trim()).filter(Boolean)))
      : oldDbIds;
  if (finalDbIds.length === 0) throw new Error('dbIds 不能为空');

  const txn = db.transaction(() => {
    db.prepare(`UPDATE usage_entries SET title = ?, content = ? WHERE id = ?`).run(
      finalTitle,
      finalContent,
      index
    );
    if (dbIds !== undefined) {
      db.prepare(`DELETE FROM usage_entry_dbs WHERE entry_id = ?`).run(index);
      const ins = db.prepare(
        `INSERT OR IGNORE INTO usage_entry_dbs (entry_id, db_id) VALUES (?, ?)`
      );
      for (const d of finalDbIds) ins.run(index, d);
    }
  });
  txn();

  return {
    index: row.id,
    addedAt: row.added_at,
    dbIds: finalDbIds,
    title: finalTitle,
    content: finalContent,
  };
}

export function bindDbIds(
  addIds: string[],
  removeIds: string[],
  entries?: number[]
): { added: number; removed: number; affected: number } {
  if (addIds.length === 0 && removeIds.length === 0) {
    throw new Error('必须指定 --add 或 --remove 至少一个 dbId');
  }
  const cleanedAdd = Array.from(new Set(addIds.map((s) => s.trim()).filter(Boolean)));
  const cleanedRemove = Array.from(new Set(removeIds.map((s) => s.trim()).filter(Boolean)));
  if (cleanedAdd.length === 0 && cleanedRemove.length === 0) {
    throw new Error('--add / --remove 值不能为空');
  }
  const db = getDb();
  const ins = db.prepare(
    `INSERT OR IGNORE INTO usage_entry_dbs (entry_id, db_id) VALUES (?, ?)`
  );
  const del = db.prepare(
    `DELETE FROM usage_entry_dbs WHERE entry_id = ? AND db_id = ?`
  );
  const selAll = db.prepare(`SELECT id FROM usage_entries`);
  const selOne = db.prepare(`SELECT id FROM usage_entries WHERE id = ?`);
  const ids: number[] = entries && entries.length > 0
    ? entries.flatMap((i) => {
        const r = selOne.get(i) as { id: number } | undefined;
        return r ? [r.id] : [];
      })
    : (selAll.all() as Array<{ id: number }>).map((r) => r.id);
  if (ids.length === 0) {
    return { added: 0, removed: 0, affected: 0 };
  }
  let added = 0;
  let removed = 0;
  const affected = new Set<number>();
  const txn = db.transaction(() => {
    for (const id of ids) {
      for (const d of cleanedAdd) {
        const r = ins.run(id, d);
        if (r.changes > 0) {
          added++;
          affected.add(id);
        }
      }
      for (const d of cleanedRemove) {
        const r = del.run(id, d);
        if (r.changes > 0) {
          removed++;
          affected.add(id);
        }
      }
    }
  });
  txn();
  return { added, removed, affected: affected.size };
}

export function usageFilePath(): string {
  return USAGE_FILE;
}

export function closeUsageDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}