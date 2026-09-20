import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { dirname } from 'path';

import { USAGE_FILE } from '../utils/paths.js';

export interface UsageEntry {
  index: number;
  addedAt: string;
  dbId: string;
  note?: string;
  sql: string;
}

const HEADER = `# db-driver 用法笔记

每条用法绑定一个 dbId（数据库连接别名），便于按库查阅、复用。
可用 \`db-driver usage edit\` 手动整理。

`;

function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ensureFile(): void {
  mkdirSync(dirname(USAGE_FILE), { recursive: true });
  if (!existsSync(USAGE_FILE)) {
    writeFileSync(USAGE_FILE, HEADER, 'utf8');
  }
}

function parseEntries(raw: string): UsageEntry[] {
  const entries: UsageEntry[] = [];
  const blocks = raw.split(/^## /m).slice(1);
  for (const b of blocks) {
    const sqlMatch = b.match(/```sql\n([\s\S]+?)\n```/);
    if (!sqlMatch) continue;
    const headingLine = b.split('\n', 1)[0].trim();
    const parts = headingLine.split('·').map((s) => s.trim());
    if (parts.length < 2) continue;
    const addedAt = parts[0];
    const dbId = parts[1];
    const note = parts.length >= 3 ? parts.slice(2).join(' · ') : undefined;
    entries.push({
      index: entries.length + 1,
      addedAt,
      dbId,
      note,
      sql: sqlMatch[1].trim(),
    });
  }
  return entries;
}

export function listUsage(dbId?: string): UsageEntry[] {
  if (!existsSync(USAGE_FILE)) return [];
  const all = parseEntries(readFileSync(USAGE_FILE, 'utf8'));
  return dbId ? all.filter((e) => e.dbId === dbId) : all;
}

export function addUsage(sql: string, note: string | undefined, dbId: string): UsageEntry {
  if (!dbId || !dbId.trim()) {
    throw new Error('dbId 不能为空（用法必须绑定到具体数据库连接）');
  }
  ensureFile();
  const addedAt = now();
  const heading = `## ${addedAt} · ${dbId.trim()}${note ? ' · ' + note.trim() : ''}\n`;
  const block = `${heading}\`\`\`sql\n${sql.trim()}\n\`\`\`\n\n`;
  appendFileSync(USAGE_FILE, block, 'utf8');
  return { index: 0, addedAt, dbId: dbId.trim(), note, sql: sql.trim() };
}

export function clearUsage(dbId?: string): number {
  const all = listUsage();
  const before = all.length;
  const filtered = dbId ? all.filter((e) => e.dbId !== dbId) : [];
  ensureFile();
  let raw = HEADER;
  for (const e of filtered) {
    raw += `## ${e.addedAt} · ${e.dbId}${e.note ? ' · ' + e.note : ''}\n`;
    raw += '```sql\n' + e.sql + '\n```\n\n';
  }
  writeFileSync(USAGE_FILE, raw, 'utf8');
  return before - filtered.length;
}

export function removeUsage(index: number): UsageEntry | null {
  const all = listUsage();
  const target = all.find((e) => e.index === index);
  if (!target) return null;
  const remaining = all.filter((e) => e.index !== index);
  ensureFile();
  let raw = HEADER;
  for (const e of remaining) {
    raw += `## ${e.addedAt} · ${e.dbId}${e.note ? ' · ' + e.note : ''}\n`;
    raw += '```sql\n' + e.sql + '\n```\n\n';
  }
  writeFileSync(USAGE_FILE, raw, 'utf8');
  return target;
}

export function updateUsage(
  index: number,
  sql: string,
  note: string | undefined,
  dbId: string | undefined
): UsageEntry | null {
  const all = listUsage();
  const idx = all.findIndex((e) => e.index === index);
  if (idx < 0) return null;
  const finalDbId = (dbId ?? all[idx].dbId).trim();
  if (!finalDbId) throw new Error('dbId 不能为空');
  all[idx] = {
    ...all[idx],
    dbId: finalDbId,
    sql: sql.trim(),
    note: note?.trim() || undefined,
  };
  ensureFile();
  let raw = HEADER;
  for (const e of all) {
    raw += `## ${e.addedAt} · ${e.dbId}${e.note ? ' · ' + e.note : ''}\n`;
    raw += '```sql\n' + e.sql + '\n```\n\n';
  }
  writeFileSync(USAGE_FILE, raw, 'utf8');
  return all[idx];
}

export function usageFilePath(): string {
  return USAGE_FILE;
}