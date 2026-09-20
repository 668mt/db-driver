import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { dirname } from 'path';

import { USAGE_FILE } from '../utils/paths.js';

export interface UsageEntry {
  index: number;
  addedAt: string;
  dbId: string;
  title: string;
  content: string;
}

const HEADER = `# db-driver 用法笔记

每条笔记绑定一个 dbId（数据库连接别名）。
标题是简短说明；正文是 Markdown 内容（可含 \`\`\`sql 代码块）。

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

function entryToBlock(addedAt: string, dbId: string, title: string, content: string): string {
  return `## ${addedAt} · ${dbId} · ${title}\n\n${content.trim()}\n\n`;
}

function parseEntries(raw: string): UsageEntry[] {
  const entries: UsageEntry[] = [];
  const blocks = raw.split(/^## /m).slice(1);
  for (const b of blocks) {
    const firstLineEnd = b.indexOf('\n');
    const headingLine = (firstLineEnd >= 0 ? b.slice(0, firstLineEnd) : b).trim();
    const body = firstLineEnd >= 0 ? b.slice(firstLineEnd + 1).trim() : '';
    if (!body) continue;
    const parts = headingLine.split('·').map((s) => s.trim());
    if (parts.length < 3) continue;
    const [addedAt, dbId, ...rest] = parts;
    const title = rest.join(' · ');
    entries.push({
      index: entries.length + 1,
      addedAt,
      dbId,
      title,
      content: body,
    });
  }
  return entries;
}

export function listUsage(dbId?: string, keyword?: string): UsageEntry[] {
  if (!existsSync(USAGE_FILE)) return [];
  let all = parseEntries(readFileSync(USAGE_FILE, 'utf8'));
  if (dbId) all = all.filter((e) => e.dbId === dbId);
  if (keyword && keyword.trim()) {
    const k = keyword.toLowerCase();
    all = all.filter(
      (e) =>
        e.dbId.toLowerCase().includes(k) ||
        e.title.toLowerCase().includes(k) ||
        e.content.toLowerCase().includes(k)
    );
  }
  return all.sort((a, b) => {
    const c = a.dbId.localeCompare(b.dbId);
    return c !== 0 ? c : a.title.localeCompare(b.title);
  });
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
  ensureFile();
  const addedAt = now();
  appendFileSync(
    USAGE_FILE,
    entryToBlock(addedAt, dbId.trim(), title.trim(), content),
    'utf8'
  );
  return { index: 0, addedAt, dbId: dbId.trim(), title: title.trim(), content: content.trim() };
}

export function clearUsage(dbId?: string): number {
  const all = listUsage();
  const before = all.length;
  const filtered = dbId ? all.filter((e) => e.dbId !== dbId) : [];
  ensureFile();
  let raw = HEADER;
  for (const e of filtered)
    raw += entryToBlock(e.addedAt, e.dbId, e.title, e.content);
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
  for (const e of remaining)
    raw += entryToBlock(e.addedAt, e.dbId, e.title, e.content);
  writeFileSync(USAGE_FILE, raw, 'utf8');
  return target;
}

export function updateUsage(
  index: number,
  title: string | undefined,
  content: string | undefined,
  dbId: string | undefined
): UsageEntry | null {
  const all = listUsage();
  const idx = all.findIndex((e) => e.index === index);
  if (idx < 0) return null;
  const finalTitle = (title ?? all[idx].title).trim();
  const finalContent = (content ?? all[idx].content).trim();
  const finalDbId = (dbId ?? all[idx].dbId).trim();
  if (!finalTitle) throw new Error('标题不能为空');
  if (!finalContent) throw new Error('笔记内容不能为空');
  if (!finalDbId) throw new Error('dbId 不能为空');
  all[idx] = { ...all[idx], dbId: finalDbId, title: finalTitle, content: finalContent };
  ensureFile();
  let raw = HEADER;
  for (const e of all)
    raw += entryToBlock(e.addedAt, e.dbId, e.title, e.content);
  writeFileSync(USAGE_FILE, raw, 'utf8');
  return all[idx];
}

export function usageFilePath(): string {
  return USAGE_FILE;
}