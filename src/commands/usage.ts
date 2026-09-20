import { spawn } from 'child_process';

import {
  addUsage,
  clearUsage,
  listUsage,
  removeUsage,
  updateUsage,
  usageFilePath,
} from '../store/usageStore.js';
import { closeConfigDb } from '../store/configStore.js';

export interface UsageListOptions {
  dbId?: string;
  json: boolean;
}

export interface UsageSaveOptions {
  json: boolean;
}

export interface UsageClearOptions {
  dbId?: string;
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
  const entries = listUsage(options.dbId);
  const filterDesc = options.dbId ? ` (dbId=${options.dbId})` : '';
  if (options.json) {
    console.log(
      JSON.stringify(
        { count: entries.length, dbId: options.dbId ?? null, entries, file: usageFilePath() },
        null,
        2
      )
    );
    closeConfigDb();
    return;
  }
  if (entries.length === 0) {
    console.log(`(没有${options.dbId ? `dbId=${options.dbId} 的` : ''}用法记录)`);
    console.log('');
    console.log('添加:');
    console.log(`  db-driver usage save --dbId <id> --sql "SELECT * FROM ..." --note "..."`);
    console.log('手动编辑:');
    console.log(`  db-driver usage edit     # 用 $EDITOR 打开 ${usageFilePath()}`);
    closeConfigDb();
    return;
  }
  console.log(`\n📚 ${entries.length} 条用法${filterDesc} (${usageFilePath()})\n`);
  for (const e of entries) {
    const header = `[${e.index}] ${e.addedAt} · ${e.dbId}${e.note ? ' · ' + e.note : ''}`;
    console.log(header);
    const sqlLines = e.sql.split('\n');
    for (const line of sqlLines) {
      console.log(`    ${line}`);
    }
    console.log('');
  }
  console.log('操作:');
  console.log(`  db-driver usage edit                                       # 手动编辑文件`);
  console.log(`  db-driver usage save --dbId <id> --sql "..." --note "..."   # 追加一条`);
  console.log(`  db-driver usage list --dbId <id>                           # 查某个库的用法`);
  console.log(`  db-driver usage rm <index>                                 # 删除指定序号`);
  console.log(`  db-driver usage clear --dbId <id> --yes                    # 清空某库（不加 --dbId 清全部）`);
  closeConfigDb();
}

export async function runUsageSave(
  sql: string,
  note: string | undefined,
  dbId: string,
  options: UsageSaveOptions
): Promise<void> {
  if (!sql || !sql.trim()) {
    throw new Error('--sql 不能为空');
  }
  if (!dbId || !dbId.trim()) {
    throw new Error('--dbId 不能为空（用法必须绑定到具体数据库连接）');
  }
  const entry = addUsage(sql, note, dbId);
  if (options.json) {
    console.log(JSON.stringify({ ok: true, entry }, null, 2));
  } else {
    console.log(`✅ 已保存用法`);
    console.log(`   dbId:  ${entry.dbId}`);
    console.log(`   时间:  ${entry.addedAt}`);
    if (entry.note) console.log(`   说明:  ${entry.note}`);
    console.log(`   SQL:   ${entry.sql.split('\n')[0]}${entry.sql.includes('\n') ? '...' : ''}`);
    console.log(`   文件:  ${usageFilePath()}`);
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
  const before = listUsage(options.dbId).length;
  if (before === 0) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, cleared: 0, dbId: options.dbId ?? null }));
    } else {
      console.log(`(没有${options.dbId ? `dbId=${options.dbId} 的` : ''}用法可清空)`);
    }
    closeConfigDb();
    return;
  }
  if (!options.yes) {
    throw new Error(
      `将清空 ${before} 条${options.dbId ? `dbId=${options.dbId} 的` : ''}用法。加 --yes 确认`
    );
  }
  const cleared = clearUsage(options.dbId);
  if (options.json) {
    console.log(JSON.stringify({ ok: true, cleared, dbId: options.dbId ?? null }, null, 2));
  } else {
    console.log(`✅ 已清空 ${cleared} 条用法`);
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
    console.log(`✅ 已删除 [${index}] ${removed.addedAt} · ${removed.dbId}${removed.note ? ' · ' + removed.note : ''}`);
  }
  closeConfigDb();
}

export async function runUsageUpdate(
  index: number,
  sql: string,
  note: string | undefined,
  dbId: string | undefined,
  options: { json: boolean }
): Promise<void> {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error('序号必须是 ≥ 1 的整数');
  }
  if (!sql || !sql.trim()) {
    throw new Error('--sql 不能为空');
  }
  const updated = updateUsage(index, sql, note, dbId);
  if (!updated) {
    throw new Error(`未找到序号 [${index}]`);
  }
  if (options.json) {
    console.log(JSON.stringify({ ok: true, entry: updated }, null, 2));
  } else {
    console.log(`✅ 已更新 [${index}] ${updated.dbId}`);
  }
  closeConfigDb();
}

void runUsageUpdate;