import {
  addUsage,
  bindDbIds,
  clearUsage,
  getUsage,
  listUsage,
  removeUsage,
  updateUsage,
  usageFilePath,
} from '../store/usageStore.js';
import { closeConfigDb } from '../store/configStore.js';

export interface UsageListOptions {
  dbIds?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  json: boolean;
}

export interface UsageSaveOptions {
  dbIds: string[];
  json: boolean;
}

export interface UsageUpdateOptions {
  json: boolean;
}

export interface UsageBindOptions {
  add: string[];
  remove: string[];
  entries?: number[];
  json: boolean;
}

export interface UsageClearOptions {
  dbIds?: string[];
  yes: boolean;
  json: boolean;
}

function parseDbIds(s: string | undefined): string[] | undefined {
  if (s === undefined) return undefined;
  const ids = Array.from(
    new Set(
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
  return ids;
}

function formatDbIds(ids: string[]): string {
  return ids.join(', ');
}

export async function runUsageList(options: UsageListOptions): Promise<void> {
  const dbIdFilter = options.dbIds && options.dbIds.length > 0 ? options.dbIds[0] : undefined;
  const offset = options.offset ?? 0;
  const { total, entries } = listUsage(dbIdFilter, options.search, options.limit, offset);
  const filters: string[] = [];
  if (options.dbIds && options.dbIds.length > 0) filters.push(`dbId=${options.dbIds.join('|')}`);
  if (options.search) filters.push(`search="${options.search}"`);
  const filterDesc = filters.length > 0 ? ` (${filters.join(', ')})` : '';
  const limit = options.limit;
  const start = entries.length > 0 ? offset + 1 : 0;
  const end = offset + entries.length;
  const shownDesc =
    limit && total > entries.length
      ? ` 显示 ${start}-${end}/${total} (offset=${offset}, limit=${limit})`
      : limit
        ? ` 显示 ${start}-${end}/${total} (offset=${offset}, limit=${limit})`
        : '';
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          total,
          shown: entries.length,
          offset,
          limit: limit ?? null,
          dbIds: options.dbIds ?? null,
          entries,
          file: usageFilePath(),
        },
        null,
        2
      )
    );
    closeConfigDb();
    return;
  }
  if (entries.length === 0) {
    if (total === 0) {
      console.log(`(没有${options.dbIds && options.dbIds.length > 0 ? `dbId=${options.dbIds.join('|')} 的` : ''}用法记录)`);
      console.log('');
      console.log('添加:');
      console.log(`  db-driver usage save --dbId a,b --title "短标题" --content "Markdown 内容"`);
      console.log('更新:');
      console.log(`  db-driver usage update <index> --title "..." --content "..." --dbIds a,b`);
      console.log('批量改关联:');
      console.log(`  db-driver usage bind --add prd`);
      closeConfigDb();
      return;
    }
    console.log(`(offset=${offset} 已超出，共 ${total} 条)`);
    closeConfigDb();
    return;
  }
  console.log(`\n📚 ${total} 条用法${shownDesc}${filterDesc} (${usageFilePath()})\n`);
  for (const e of entries) {
    const dbStr = e.dbIds.join(', ');
    console.log(`[${e.index}] ${e.addedAt} · ${dbStr} · ${e.title}`);
    const firstLine = e.content.split('\n')[0].trim();
    const preview = firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
    if (preview) console.log(`    ${preview}`);
    console.log('');
  }
  console.log('操作:');
  console.log(`  db-driver usage detail <index>                            # 查看某条完整内容`);
  console.log(`  db-driver usage save --dbId a,b --title "..." --content "..."  # 多 dbId 逗号分隔`);
  console.log(`  db-driver usage list --dbId mukeyuan-dev --search <kw> --limit 50 --offset 0  # 翻页`);
  console.log(`  db-driver usage rm <index>                                 # 删除指定序号`);
  console.log(`  db-driver usage clear --dbId mukeyuan-dev --yes            # 清空某库（不加 --dbId 清全部）`);
  if (limit && total > entries.length) {
    const nextOffset = end;
    console.log(`\n提示: 还有 ${total - end} 条未显示 → db-driver usage list --offset ${nextOffset}`);
  }
  if (offset > 0) {
    console.log(`  回到第一页 → db-driver usage list --offset 0`);
  }
  closeConfigDb();
}

export async function runUsageSave(
  title: string,
  content: string,
  dbIdsRaw: string | undefined,
  options: UsageSaveOptions
): Promise<void> {
  const dbIds = options.dbIds.length > 0 ? options.dbIds : parseDbIds(dbIdsRaw) ?? [];
  if (dbIds.length === 0) {
    throw new Error('--dbId 必填且非空（逗号分隔多个，如 --dbId a,b,c）');
  }
  if (!title || !title.trim()) {
    throw new Error('--title 不能为空');
  }
  if (!content || !content.trim()) {
    throw new Error('--content 不能为空');
  }
  const entry = addUsage(title, content, dbIds);
  if (options.json) {
    console.log(JSON.stringify({ ok: true, entry }, null, 2));
  } else {
    console.log(`✅ 已保存用法`);
    console.log(`   dbIds:   ${formatDbIds(entry.dbIds)}`);
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
    console.log(`   dbIds:   ${formatDbIds(entry.dbIds)}`);
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

export async function runUsageBind(options: UsageBindOptions): Promise<void> {
  const result = bindDbIds(options.add, options.remove, options.entries);
  if (options.json) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } else {
    const parts: string[] = [];
    if (result.added > 0) parts.push(`+${result.added} 条关联`);
    if (result.removed > 0) parts.push(`-${result.removed} 条关联`);
    console.log(`✅ 批量更新完成：${parts.join('，') || '无变化'}（影响 ${result.affected} 条笔记）`);
    if (options.add.length > 0) console.log(`   + add:     ${options.add.join(', ')}`);
    if (options.remove.length > 0) console.log(`   - remove:  ${options.remove.join(', ')}`);
    if (options.entries && options.entries.length > 0) {
      console.log(`   范围:      [${options.entries.join(', ')}]`);
    } else {
      console.log(`   范围:      所有笔记`);
    }
  }
  closeConfigDb();
}

export async function runUsageClear(options: UsageClearOptions): Promise<void> {
  const dbIdFilter = options.dbIds && options.dbIds.length > 0 ? options.dbIds[0] : undefined;
  const before = dbIdFilter ? listUsage(dbIdFilter).total : (() => {
    let t = 0;
    for (const id of options.dbIds ?? []) t += listUsage(id).total;
    return options.dbIds && options.dbIds.length > 0 ? t : listUsage().total;
  })();
  if (before === 0) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, cleared: 0, dbIds: options.dbIds ?? null }));
    } else {
      console.log(`(没有${options.dbIds && options.dbIds.length > 0 ? `dbId=${options.dbIds.join('|')} 的` : ''}用法可清空)`);
    }
    closeConfigDb();
    return;
  }
  if (!options.yes) {
    throw new Error(
      `将清空 ${before} 条${options.dbIds && options.dbIds.length > 0 ? `dbId=${options.dbIds.join('|')} 的` : ''}用法。加 --yes 确认`
    );
  }
  let cleared = 0;
  for (const id of options.dbIds ?? []) cleared += clearUsage(id);
  if (!options.dbIds || options.dbIds.length === 0) cleared = clearUsage();
  if (options.json) {
    console.log(JSON.stringify({ ok: true, cleared, dbIds: options.dbIds ?? null }, null, 2));
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
    console.log(`✅ 已删除 [${index}] ${formatDbIds(removed.dbIds)} · ${removed.title}`);
  }
  closeConfigDb();
}

export async function runUsageUpdate(
  index: number,
  title: string | undefined,
  content: string | undefined,
  dbIdsRaw: string | undefined,
  options: UsageUpdateOptions
): Promise<void> {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error('序号必须是 ≥ 1 的整数');
  }
  const dbIds = parseDbIds(dbIdsRaw);
  const updated = updateUsage(index, title, content, dbIds);
  if (!updated) {
    throw new Error(`未找到序号 [${index}]`);
  }
  if (options.json) {
    console.log(JSON.stringify({ ok: true, entry: updated }, null, 2));
  } else {
    console.log(`✅ 已更新 [${index}] ${formatDbIds(updated.dbIds)} · ${updated.title}`);
  }
  closeConfigDb();
}