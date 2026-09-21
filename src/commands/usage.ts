import { spawn } from 'child_process';

import {
  addUsage,
  clearUsage,
  getUsage,
  listUsage,
  removeUsage,
  updateUsage,
  usageFilePath,
} from '../store/usageStore.js';
import { closeConfigDb } from '../store/configStore.js';

export interface UsageListOptions {
  dbId?: string;
  search?: string;
  limit?: number;
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
  const { total, entries } = listUsage(options.dbId, options.search, options.limit);
  const filters: string[] = [];
  if (options.dbId) filters.push(`dbId=${options.dbId}`);
  if (options.search) filters.push(`search="${options.search}"`);
  const filterDesc = filters.length > 0 ? ` (${filters.join(', ')})` : '';
  const shownDesc = options.limit && total > entries.length
    ? ` 显示 ${entries.length} / ${total}`
    : '';
  if (options.json) {
    console.log(
      JSON.stringify(
        { total, shown: entries.length, dbId: options.dbId ?? null, entries, file: usageFilePath() },
        null,
        2
      )
    );
    closeConfigDb();
    return;
  }
  if (entries.length === 0) {
    if (total === 0) {
      console.log(`(没有${options.dbId ? `dbId=${options.dbId} 的` : ''}用法记录)`);
      console.log('');
      console.log('添加:');
      console.log(`  db-driver usage save --dbId <id> --title "短标题" --content "Markdown 内容"`);
      console.log('手动编辑:');
      console.log(`  db-driver usage edit     # 用 $EDITOR 打开 ${usageFilePath()}`);
      closeConfigDb();
      return;
    }
    console.log(`(当前过滤条件下无匹配的用法)`);
    closeConfigDb();
    return;
  }
  console.log(`\n📚 ${total} 条用法${shownDesc}${filterDesc} (${usageFilePath()})\n`);
  for (const e of entries) {
    const firstLine = e.content.split('\n')[0].trim();
    const preview = firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
    console.log(`[${e.index}] ${e.addedAt} · ${e.dbId} · ${e.title}`);
    if (preview) console.log(`    ${preview}`);
    console.log('');
  }
  console.log('操作:');
  console.log(`  db-driver usage detail <index>                            # 查看某条完整内容`);
  console.log(`  db-driver usage save --dbId <id> --title "..." --content "..."  # 追加一条`);
  console.log(`  db-driver usage list --dbId <id> --search <kw> --limit 50 # 查 + 搜索 + 限制`);
  console.log(`  db-driver usage rm <index>                                 # 删除指定序号`);
  console.log(`  db-driver usage clear --dbId <id> --yes                    # 清空某库（不加 --dbId 清全部）`);
  if (options.limit && total > entries.length) {
    console.log(`\n提示: 还有 ${total - entries.length} 条未显示，加 --limit ${total} 看全部`);
  }
  closeConfigDb();
}

export async function runUsageSave(
  title: string,
  content: string,
  dbId: string,
  options: UsageSaveOptions
): Promise<void> {
  if (!title || !title.trim()) {
    throw new Error('--title 不能为空');
  }
  if (!content || !content.trim()) {
    throw new Error('--content 不能为空');
  }
  if (!dbId || !dbId.trim()) {
    throw new Error('--dbId 不能为空（用法必须绑定到具体数据库连接）');
  }
  const entry = addUsage(title, content, dbId);
  if (options.json) {
    console.log(JSON.stringify({ ok: true, entry }, null, 2));
  } else {
    console.log(`✅ 已保存用法`);
    console.log(`   dbId:    ${entry.dbId}`);
    console.log(`   标题:    ${entry.title}`);
    console.log(`   时间:    ${entry.addedAt}`);
    console.log(`   文件:    ${usageFilePath()}`);
  }
  closeConfigDb();
}

export async function runUsageDetail(index: number, options: { json: boolean }): Promise<void> {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error('序号必须是 ≥ 1 的整数');
  }
  const entry = getUsage(index);
  if (!entry) {
    throw new Error(`未找到序号 [${index}]（先用 db-driver usage list 看序号）`);
  }
  if (options.json) {
    console.log(JSON.stringify({ ok: true, entry }, null, 2));
  } else {
    console.log(`\n📖 用法笔记 [${entry.index}]\n`);
    console.log(`   dbId:    ${entry.dbId}`);
    console.log(`   标题:    ${entry.title}`);
    console.log(`   时间:    ${entry.addedAt}`);
    console.log(`   内容:`);
    console.log('');
    for (const line of entry.content.split('\n')) {
      console.log(`   ${line}`);
    }
    console.log('');
  }
  closeConfigDb();
}

export async function runUsageEdit(): Promise<void> {
  console.log('用法笔记存在 SQLite 数据库中（' + usageFilePath() + '）。');
  console.log('请用 CLI 增删改查：');
  console.log('  db-driver usage save --dbId <id> --title "..." --content "..."');
  console.log('  db-driver usage list [--dbId <id>] [--search <kw>]');
  console.log('  db-driver usage rm <index>');
  console.log('  db-driver usage clear [--dbId <id>] --yes');
  console.log('高级用户：可以用 sqlite3 CLI 或 GUI 工具直接编辑 usage.db。');
  closeConfigDb();
}

export async function runUsageClear(options: UsageClearOptions): Promise<void> {
  const before = listUsage(options.dbId).total;
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
    console.log(`✅ 已删除 [${index}] ${removed.addedAt} · ${removed.dbId} · ${removed.title}`);
  }
  closeConfigDb();
}

export async function runUsageUpdate(
  index: number,
  title: string | undefined,
  content: string | undefined,
  dbId: string | undefined,
  options: { json: boolean }
): Promise<void> {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error('序号必须是 ≥ 1 的整数');
  }
  const updated = updateUsage(index, title, content, dbId);
  if (!updated) {
    throw new Error(`未找到序号 [${index}]`);
  }
  if (options.json) {
    console.log(JSON.stringify({ ok: true, entry: updated }, null, 2));
  } else {
    console.log(`✅ 已更新 [${index}] ${updated.dbId} · ${updated.title}`);
  }
  closeConfigDb();
}

void runUsageUpdate;