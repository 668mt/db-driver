import { spawn } from 'child_process';

import {
  addUsage,
  clearUsage,
  listUsage,
  removeUsage,
  usageFilePath,
} from '../store/usageStore.js';
import { closeConfigDb } from '../store/configStore.js';

export interface UsageListOptions {
  json: boolean;
}

export interface UsageSaveOptions {
  json: boolean;
}

export interface UsageClearOptions {
  yes: boolean;
  json: boolean;
}

function openInEditor(file: string): Promise<void> {
  const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');
  return new Promise((resolve, reject) => {
    const child = spawn(editor, [file], { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`编辑器退出码 ${code}`));
    });
    child.on('error', (e) => reject(new Error(`无法启动编辑器 ${editor}：${e.message}`)));
  });
}

export async function runUsageList(options: UsageListOptions): Promise<void> {
  const entries = listUsage();
  if (options.json) {
    console.log(JSON.stringify({ count: entries.length, entries, file: usageFilePath() }, null, 2));
    closeConfigDb();
    return;
  }
  if (entries.length === 0) {
    console.log('(还没有用法记录)');
    console.log('');
    console.log('添加:');
    console.log(`  db-driver usage save --sql "SELECT * FROM ..." --note "查询示例"`);
    console.log('手动编辑:');
    console.log(`  db-driver usage edit     # 用 $EDITOR 打开 ${usageFilePath()}`);
    closeConfigDb();
    return;
  }
  console.log(`\n📚 ${entries.length} 条用法 (${usageFilePath()})\n`);
  for (const e of entries) {
    const header = `[${e.index}] ${e.addedAt}${e.note ? ' · ' + e.note : ''}`;
    console.log(header);
    const sqlLines = e.sql.split('\n');
    for (const line of sqlLines) {
      console.log(`    ${line}`);
    }
    console.log('');
  }
  console.log('操作:');
  console.log(`  db-driver usage edit                           # 手动编辑文件`);
  console.log(`  db-driver usage save --sql "..." --note "..."   # 追加一条`);
  console.log(`  db-driver usage rm <index>                     # 删除指定序号`);
  console.log(`  db-driver usage clear --yes                    # 清空所有`);
  closeConfigDb();
}

export async function runUsageSave(
  sql: string,
  note: string | undefined,
  options: UsageSaveOptions
): Promise<void> {
  if (!sql || !sql.trim()) {
    throw new Error('--sql 不能为空');
  }
  const entry = addUsage(sql, note);
  if (options.json) {
    console.log(JSON.stringify({ ok: true, entry }, null, 2));
  } else {
    console.log(`✅ 已保存用法`);
    console.log(`   时间: ${entry.addedAt}`);
    if (entry.note) console.log(`   说明: ${entry.note}`);
    console.log(`   SQL:  ${entry.sql.split('\n')[0]}${entry.sql.includes('\n') ? '...' : ''}`);
    console.log(`   文件: ${usageFilePath()}`);
  }
  closeConfigDb();
}

export async function runUsageEdit(): Promise<void> {
  await openInEditor(usageFilePath());
  const entries = listUsage();
  console.log(`\n✅ 已重新加载 ${entries.length} 条用法`);
  closeConfigDb();
}

export async function runUsageClear(options: UsageClearOptions): Promise<void> {
  const before = listUsage().length;
  if (before === 0) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, cleared: 0 }));
    } else {
      console.log('(没有用法可清空)');
    }
    closeConfigDb();
    return;
  }
  if (!options.yes) {
    throw new Error(`将清空 ${before} 条用法。加 --yes 确认`);
  }
  clearUsage();
  if (options.json) {
    console.log(JSON.stringify({ ok: true, cleared: before }, null, 2));
  } else {
    console.log(`✅ 已清空 ${before} 条用法`);
  }
  closeConfigDb();
}

export async function runUsageRemove(index: number, options: { json: boolean }): Promise<void> {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error('序号必须是 ≥ 1 的整数');
  }
  const removed = removeUsage(index);
  if (!removed) {
    throw new Error(`未找到序号 [${index}]（先用 db-driver usage list 看序号）`);
  }
  if (options.json) {
    console.log(JSON.stringify({ ok: true, removed }, null, 2));
  } else {
    console.log(`✅ 已删除 [${index}] ${removed.addedAt}${removed.note ? ' · ' + removed.note : ''}`);
  }
  closeConfigDb();
}