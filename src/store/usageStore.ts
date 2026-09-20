import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { dirname } from 'path';

import { USAGE_FILE } from '../utils/paths.js';

export interface UsageEntry {
  index: number;
  addedAt: string;
  note?: string;
  sql: string;
}

const HEADER = `# db-driver 用法笔记

按时间倒序追加。可用 \`db-driver usage edit\` 手动整理。

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
    const dotIdx = headingLine.indexOf('·');
    const addedAt = (dotIdx >= 0 ? headingLine.slice(0, dotIdx) : headingLine).trim();
    const note = dotIdx >= 0 ? headingLine.slice(dotIdx + 1).trim() : undefined;
    entries.push({
      index: entries.length + 1,
      addedAt,
      note: note || undefined,
      sql: sqlMatch[1].trim(),
    });
  }
  return entries;
}

export function listUsage(): UsageEntry[] {
  if (!existsSync(USAGE_FILE)) return [];
  return parseEntries(readFileSync(USAGE_FILE, 'utf8'));
}

export function addUsage(sql: string, note: string | undefined): UsageEntry {
  ensureFile();
  const addedAt = now();
  const heading = `## ${addedAt}${note ? ' · ' + note : ''}\n`;
  const block = `${heading}\`\`\`sql\n${sql.trim()}\n\`\`\`\n\n`;
  appendFileSync(USAGE_FILE, block, 'utf8');
  return { index: 0, addedAt, note, sql: sql.trim() };
}

export function clearUsage(): number {
  const before = listUsage().length;
  ensureFile();
  writeFileSync(USAGE_FILE, HEADER, 'utf8');
  return before;
}

export function removeUsage(index: number): UsageEntry | null {
  const all = listUsage();
  const target = all.find((e) => e.index === index);
  if (!target) return null;
  const remaining = all.filter((e) => e.index !== index);
  ensureFile();
  let raw = HEADER;
  for (const e of remaining) {
    raw += `## ${e.addedAt}${e.note ? ' · ' + e.note : ''}\n`;
    raw += '```sql\n' + e.sql + '\n```\n\n';
  }
  writeFileSync(USAGE_FILE, raw, 'utf8');
  return target;
}

export function usageFilePath(): string {
  return USAGE_FILE;
}