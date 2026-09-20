import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

import { USAGE_FILE } from '../utils/paths.js';

export interface UsageEntry {
  index: number;
  addedAt: string;
  dbId: string;
  title: string;
  content: string;
}

interface Row {
  id: number;
  added_at: string;
  db_id: string;
  title: string;
  content: string;
}

function rowToEntry(row: Row): UsageEntry {
  return {
    index: row.id,
    addedAt: row.added_at,
    dbId: row.db_id,
    title: row.title,
    content: row.content,
  };
}

function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  mkdirSync(dirname(USAGE_FILE), { recursive: true });
  const db = new Database(USAGE_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      added_at TEXT NOT NULL,
      db_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_db_id ON usage_entries(db_id);
    CREATE INDEX IF NOT EXISTS idx_usage_added_at ON usage_entries(added_at DESC);
  `);
  dbInstance = db;
  return db;
}

export function listUsage(dbId?: string, keyword?: string): UsageEntry[] {
  const db = getDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (dbId) {
    conds.push('db_id = ?');
    params.push(dbId);
  }
  if (keyword && keyword.trim()) {
    conds.push('(LOWER(title) LIKE ? OR LOWER(db_id) LIKE ? OR LOWER(content) LIKE ?)');
    const k = `%${keyword.toLowerCase()}%`;
    params.push(k, k, k);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.prepare(
    `SELECT id, added_at, db_id, title, content FROM usage_entries ${where} ORDER BY db_id ASC, title ASC, id ASC`
  ).all(...params) as Row[];
  return rows.map(rowToEntry);
}

export function addUsage(title: string, content: string, dbId: string): UsageEntry {
  if (!dbId || !dbId.trim()) {
    throw new Error('dbId 不能为空（用法必须绑定到具体数据库连接）');
  }
  if (!title || !title.trim()) {
    throw new Error('标题不能为空');
  }
  if (!content || !content.trim()) {
    throw new Error('笔记内容不能为空');
  }
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO usage_entries (added_at, db_id, title, content) VALUES (?, ?, ?, ?)`
    )
    .run(now(), dbId.trim(), title.trim(), content.trim());
  return {
    index: Number(result.lastInsertRowid),
    addedAt: now(),
    dbId: dbId.trim(),
    title: title.trim(),
    content: content.trim(),
  };
}

export function clearUsage(dbId?: string): number {
  const db = getDb();
  const sql = dbId ? `DELETE FROM usage_entries WHERE db_id = ?` : `DELETE FROM usage_entries`;
  const params = dbId ? [dbId] : [];
  const result = db.prepare(sql).run(...params);
  return Number(result.changes);
}

export function removeUsage(index: number): UsageEntry | null {
  const db = getDb();
  const row = db.prepare(`SELECT id, added_at, db_id, title, content FROM usage_entries WHERE id = ?`).get(index) as Row | undefined;
  if (!row) return null;
  db.prepare(`DELETE FROM usage_entries WHERE id = ?`).run(index);
  return rowToEntry(row);
}

export function updateUsage(
  index: number,
  title: string | undefined,
  content: string | undefined,
  dbId: string | undefined
): UsageEntry | null {
  const db = getDb();
  const row = db.prepare(`SELECT id, added_at, db_id, title, content FROM usage_entries WHERE id = ?`).get(index) as Row | undefined;
  if (!row) return null;
  const finalTitle = (title ?? row.title).trim();
  const finalContent = (content ?? row.content).trim();
  const finalDbId = (dbId ?? row.db_id).trim();
  if (!finalTitle) throw new Error('标题不能为空');
  if (!finalContent) throw new Error('笔记内容不能为空');
  if (!finalDbId) throw new Error('dbId 不能为空');
  db.prepare(
    `UPDATE usage_entries SET title = ?, content = ?, db_id = ? WHERE id = ?`
  ).run(finalTitle, finalContent, finalDbId, index);
  return {
    index: row.id,
    addedAt: row.added_at,
    dbId: finalDbId,
    title: finalTitle,
    content: finalContent,
  };
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