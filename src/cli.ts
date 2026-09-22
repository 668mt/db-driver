#!/usr/bin/env node
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { Command } from 'commander';

import { defaultPortFor, runConfigCli } from './commands/config.js';
import { runConsole, DEFAULT_CONSOLE_PORT } from './commands/console.js';
import { runInstall } from './commands/install.js';
import { runSchema } from './commands/schema.js';
import { runExecute } from './commands/execute.js';
import { runList } from './commands/list.js';
import { runShow } from './commands/show.js';
import { runTest } from './commands/test.js';
import { runRemove } from './commands/remove.js';
import { runSample } from './commands/sample.js';
import { runCount } from './commands/count.js';
import { runExplain } from './commands/explain.js';
import { runUpdate } from './commands/update.js';
import { runExport } from './commands/export.js';
import { runImport } from './commands/import.js';
import {
  runUsageBind,
  runUsageClear,
  runUsageDetail,
  runUsageList,
  runUsageRemove,
  runUsageSave,
  runUsageUpdate,
} from './commands/usage.js';
import { SKILL_DEST } from './utils/paths.js';
import { clearPool } from './db/pool.js';
import type { DbType } from './db/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
) as { version: string };

const program = new Command();

program
  .name('db-driver')
  .description('数据库查询 CLI（MySQL / PostgreSQL）')
  .version(pkg.version);

program
  .command('console')
  .description(`打开本地网页控制台（同时管理连接配置 + SQL 用法笔记，默认端口 ${DEFAULT_CONSOLE_PORT}）`)
  .option('--port <n>', `指定端口（默认 ${DEFAULT_CONSOLE_PORT}，被占用时自动改用其他端口）`, (v) =>
    parseInt(v, 10)
  )
  .option('--open', '自动在系统默认浏览器打开 URL', false)
  .action(async (opts: { port?: number; open?: boolean }) => {
    await runConsole({ port: opts.port, open: !!opts.open });
  });

program
  .command('config')
  .description('命令行保存一个数据库连接（用 db-driver console 打开网页管理）')
  .option('--dbId <id>', '连接别名')
  .option('--type <type>', '数据库类型 (mysql|postgres)')
  .option('--host <host>', '数据库 host')
  .option('--port <port>', '数据库 port', (v) => parseInt(v, 10))
  .option('--user <user>', '用户名')
  .option('--password <password>', '密码')
  .option('--database <database>', '数据库名（catalog）')
  .option('--schema <schema>', 'PostgreSQL schema 名（默认 public）')
  .option('--description <text>', '连接描述（可选，便于区分多套同形环境）')
  .option('--dml-query', '允许 SELECT', true)
  .option('--no-dml-query', '禁用 SELECT')
  .option('--dml-update', '允许 INSERT/UPDATE', false)
  .option('--dml-delete', '允许 DELETE', false)
  .option('--ddl', '允许 DDL (CREATE/ALTER/DROP)', false)
  .option('--test', '保存前先测试连接', false)
  .action(async (opts: Record<string, unknown>) => {
    const missing: string[] = [];
    if (!opts.dbId) missing.push('--dbId');
    if (!opts.type) missing.push('--type');
    if (!opts.host) missing.push('--host');
    if (!opts.user) missing.push('--user');
    if (opts.password === undefined || opts.password === '') missing.push('--password');
    if (!opts.database) missing.push('--database');
    if (missing.length > 0) {
      throw new Error(
        `缺少必填参数: ${missing.join(', ')}\n` +
          `提示：用 db-driver console 打开网页配置，或传齐以上参数命令行保存`
      );
    }

    const type = opts.type as DbType;
    if (type !== 'mysql' && type !== 'postgres') {
      throw new Error(`--type 必须是 mysql 或 postgres，当前: ${type}`);
    }

    const port = typeof opts.port === 'number' ? opts.port : defaultPortFor(type);

    await runConfigCli({
      dbId: opts.dbId as string,
      type,
      host: opts.host as string,
      port,
      user: opts.user as string,
      password: opts.password as string,
      database: opts.database as string,
      schema: (opts.schema as string | undefined) || undefined,
      description: (opts.description as string | undefined) || undefined,
      permissions: {
        dmlQuery: opts.dmlQuery !== false,
        dmlUpdate: opts.dmlUpdate === true,
        dmlDelete: opts.dmlDelete === true,
        ddl: opts.ddl === true,
      },
      test: opts.test === true,
    });
  });

program
  .command('list')
  .description('列出所有已配置的数据库连接')
  .option('--json', '输出 JSON', false)
  .action(async (opts: { json: boolean }) => {
    await runList({ json: !!opts.json });
  });

program
  .command('show <dbId>')
  .description('查看指定连接的详情（不打 DB）')
  .option('--json', '输出 JSON', false)
  .option('--reveal-password', '显示明文密码', false)
  .action(async (dbId: string, opts: { json: boolean; revealPassword: boolean }) => {
    await runShow(dbId, { json: !!opts.json, revealPassword: !!opts.revealPassword });
  });

program
  .command('test <dbId>')
  .description('测试数据库连接')
  .action(async (dbId: string) => {
    await runTest(dbId);
  });

program
  .command('remove <dbId>')
  .description('删除一个数据库连接')
  .option('--yes', '跳过确认', false)
  .action(async (dbId: string, opts: { yes: boolean }) => {
    await runRemove(dbId, { yes: !!opts.yes });
  });

program
  .command('schema <dbId>')
  .description('查看数据库的 schema（默认只列表名，--table 看字段）')
  .option('-t, --table <name>', '查看指定表的字段详情')
  .option('-s, --search <pattern>', '按表名模糊过滤')
  .option('--schema <name>', 'PostgreSQL 临时切换 schema（覆盖配置中的默认 schema）')
  .option('--limit <n>', '最多列出多少张表', (v) => parseInt(v, 10))
  .option('--offset <n>', '表列表起始偏移', (v) => parseInt(v, 10), 0)
  .option('--show-partitions', '在 --table 详情里输出分区子表（默认只显示个数）', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      dbId: string,
      opts: {
        table?: string;
        search?: string;
        schema?: string;
        limit?: number;
        offset: number;
        showPartitions: boolean;
        json: boolean;
      }
    ) => {
      await runSchema(dbId, {
        table: opts.table,
        search: opts.search,
        schema: opts.schema,
        limit: opts.limit,
        offset: opts.offset ?? 0,
        showPartitions: !!opts.showPartitions,
        json: !!opts.json,
      });
    }
  );

program
  .command('execute <dbId> <sql>')
  .description('在指定数据库上执行 SQL（单条语句）')
  .option('--limit <n>', 'SELECT 最多返回多少行（默认 50）', (v) => parseInt(v, 10), 50)
  .option('--json', '以 JSON 格式输出', false)
  .action(async (dbId: string, sql: string, opts: { limit: number; json: boolean }) => {
    await runExecute(dbId, sql, { limit: opts.limit, json: !!opts.json });
  });

program
  .command('sample <dbId> <table>')
  .description('查看表里的样本数据（默认 10 行）')
  .option('--limit <n>', '返回行数', (v) => parseInt(v, 10), 10)
  .option('--where <expr>', '附加 WHERE 条件')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (dbId: string, table: string, opts: { limit: number; where?: string; json: boolean }) => {
    await runSample(dbId, table, { limit: opts.limit, where: opts.where, json: !!opts.json });
  });

program
  .command('count <dbId> <table>')
  .description('统计表的行数')
  .option('--where <expr>', '附加 WHERE 条件')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (dbId: string, table: string, opts: { where?: string; json: boolean }) => {
    await runCount(dbId, table, { where: opts.where, json: !!opts.json });
  });

program
  .command('explain <dbId> <sql>')
  .description('查看 SQL 的执行计划（默认仅计划，--analyze 会真正执行）')
  .option('--analyze', '真正执行并返回实际耗时', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(async (dbId: string, sql: string, opts: { analyze: boolean; json: boolean }) => {
    await runExplain(dbId, sql, { analyze: !!opts.analyze, json: !!opts.json });
  });

program
  .command('install')
  .description(`把 skill 安装到 ${SKILL_DEST}`)
  .action(async () => {
    await runInstall();
  });

program
  .command('update [version]')
  .description('从 npm 更新到最新版本（或指定版本）')
  .option('--check', '仅检查不更新', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(async (version: string | undefined, opts: { check: boolean; json: boolean }) => {
    await runUpdate({ check: !!opts.check, target: version, json: !!opts.json });
  });

program
  .command('export <file>')
  .description('导出所有连接到文件（passphrase 留空 = 明文 JSON；填了 ≥ 8 位 = 加密文件）')
  .option('--passphrase <pwd>', '加密口令（留空 = 不加密；填了至少 8 位 = 加密）', '')
  .option('--no-include-passwords', '脱敏导出（密码置空，便于共享模板）')
  .option('--force', '覆盖已存在文件', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      file: string,
      opts: { passphrase: string; includePasswords: boolean; force: boolean; json: boolean }
    ) => {
      await runExport(file, {
        passphrase: opts.passphrase,
        includePasswords: opts.includePasswords,
        force: opts.force,
        json: opts.json,
      });
    }
  );

program
  .command('import <file>')
  .description('从加密文件导入连接（用导出时的 passphrase 解密）')
  .requiredOption('--passphrase <pwd>', '导出时的加密口令')
  .option('--replace', '替换现有同 dbId 的连接（默认跳过冲突）', false)
  .option('--yes', '跳过确认', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      file: string,
      opts: { passphrase: string; replace: boolean; yes: boolean; json: boolean }
    ) => {
      await runImport(file, {
        passphrase: opts.passphrase,
        replace: opts.replace,
        yes: opts.yes,
        json: opts.json,
      });
    }
  );

const usageCmd = program
  .command('usage')
  .description('管理 SQL 用法笔记（明文 Markdown，绑定到一个或多个 dbId）')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { json: boolean }) => {
    await runUsageList({ json: !!opts.json });
  });

usageCmd
  .command('list')
  .description('列出用法（默认只显示标题；--dbId / --search 过滤；--limit + --offset 翻页）')
  .option('--dbId <ids>', '只显示该 dbId 的用法（一个笔记可关联多个 dbId，逗号分隔 OR 匹配）')
  .option('--search <keyword>', '关键词搜索（dbIds / title / content 不区分大小写）')
  .option('--limit <n>', '最多显示多少条（不传=全部）', (v) => parseInt(v, 10))
  .option('--offset <n>', '起始偏移（与 --limit 配合翻页）', (v) => parseInt(v, 10), 0)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (opts: {
      dbId?: string;
      search?: string;
      limit?: number;
      offset: number;
      json: boolean;
    }) => {
      const dbIds = opts.dbId
        ? Array.from(
            new Set(
              opts.dbId
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          )
        : undefined;
      await runUsageList({
        dbIds,
        search: opts.search,
        limit: opts.limit,
        offset: opts.offset ?? 0,
        json: !!opts.json,
      });
    }
  );

usageCmd
  .command('detail <index>')
  .description('查看指定序号的用法完整内容（Markdown）')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (indexStr: string, opts: { json: boolean }) => {
    const index = parseInt(indexStr, 10);
    if (Number.isNaN(index)) throw new Error(`序号必须是整数: ${indexStr}`);
    await runUsageDetail(index, { json: !!opts.json });
  });

usageCmd
  .command('save')
  .description('追加一条新用法（--dbId / --title 必填且非空；--content 或 --content-file 二选一）')
  .requiredOption('--dbId <ids>', '绑定的数据库连接别名（必填，多个用逗号分隔，如 a,b,c）')
  .requiredOption('--title <t>', '短标题（必填）')
  .option('--content <md>', 'Markdown 内容（可含 ```sql 代码块）')
  .option('--content-file <path>', '从文件读取内容（- 表示 stdin，适合长 SQL/Markdown）')
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (opts: { dbId: string; title: string; content?: string; contentFile?: string; json: boolean }) => {
      const missing: string[] = [];
      if (!opts.dbId || !opts.dbId.trim()) missing.push('--dbId');
      if (!opts.title || !opts.title.trim()) missing.push('--title');
      if (!opts.content && !opts.contentFile) missing.push('--content 或 --content-file');
      if (missing.length > 0) {
        throw new Error(`缺少必填参数: ${missing.join(', ')}`);
      }
      let content = opts.content ?? '';
      if (opts.contentFile) {
        if (opts.content) {
          throw new Error('--content 和 --content-file 只能二选一');
        }
        const path = opts.contentFile === '-' ? 0 : opts.contentFile;
        content = readFileSync(path, 'utf8');
      }
      if (!content.trim()) {
        throw new Error('--content 或 --content-file 读取的内容不能为空');
      }
      await runUsageSave(opts.title, content, opts.dbId, { dbIds: [], json: !!opts.json });
    }
  );

usageCmd
  .command('update <index>')
  .description('更新指定序号的笔记（AI 友好：--title/--content/--content-file/--dbIds 可选）')
  .option('--title <t>', '新标题（不改则省略）')
  .option('--content <md>', '新 Markdown 内容（不改则省略）')
  .option('--content-file <path>', '从文件读取新内容（- 表示 stdin）')
  .option('--dbIds <ids>', '新 dbIds（逗号分隔；不改则省略）')
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      indexStr: string,
      opts: { title?: string; content?: string; contentFile?: string; dbIds?: string; json: boolean }
    ) => {
      const index = parseInt(indexStr, 10);
      if (Number.isNaN(index)) throw new Error(`序号必须是整数: ${indexStr}`);
      let content: string | undefined;
      if (opts.contentFile) {
        if (opts.content) {
          throw new Error('--content 和 --content-file 只能二选一');
        }
        const path = opts.contentFile === '-' ? 0 : opts.contentFile;
        content = readFileSync(path, 'utf8');
      } else {
        content = opts.content;
      }
      await runUsageUpdate(index, opts.title, content, opts.dbIds, { json: !!opts.json });
    }
  );

usageCmd
  .command('bind')
  .description('批量给笔记加/减 dbId 关联（--add / --remove 逗号分隔；不加 --entries 默认所有）')
  .option('--add <ids>', '要新增关联的 dbId（逗号分隔）')
  .option('--remove <ids>', '要移除关联的 dbId（逗号分隔）')
  .option('--entries <idxs>', '只对指定序号的笔记生效（逗号分隔；不加默认所有）')
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (opts: { add?: string; remove?: string; entries?: string; json: boolean }) => {
      const add = opts.add
        ? Array.from(
            new Set(
              opts.add
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          )
        : [];
      const remove = opts.remove
        ? Array.from(
            new Set(
              opts.remove
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          )
        : [];
      if (add.length === 0 && remove.length === 0) {
        throw new Error('必须指定 --add 或 --remove 至少一个');
      }
      const entries = opts.entries
        ? opts.entries
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !Number.isNaN(n) && n > 0)
        : undefined;
      await runUsageBind({ add, remove, entries, json: !!opts.json });
    }
  );

usageCmd
  .command('clear')
  .description('清空用法（--dbId 清某个库，不加清全部；不可撤销）')
  .option('--dbId <ids>', '只清该 dbId 的用法（多个用逗号分隔）')
  .option('--yes', '跳过确认', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { dbId?: string; yes: boolean; json: boolean }) => {
    const dbIds = opts.dbId
      ? Array.from(
          new Set(
            opts.dbId
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        )
      : undefined;
    await runUsageClear({ dbIds, yes: !!opts.yes, json: !!opts.json });
  });

usageCmd
  .command('rm <index>')
  .description('删除指定序号的用法（先 db-driver usage list 看序号）')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (indexStr: string, opts: { json: boolean }) => {
    const index = parseInt(indexStr, 10);
    if (Number.isNaN(index)) throw new Error(`序号必须是整数: ${indexStr}`);
    await runUsageRemove(index, { json: !!opts.json });
  });

program.addHelpText(
  'after',
  `
连接管理:
  $ db-driver list                              # 列出所有 dbId
  $ db-driver list --json
  $ db-driver show <dbId>                       # 查看连接详情
  $ db-driver test <dbId>                       # 测试连接
  $ db-driver remove <dbId> --yes               # 删除连接

数据浏览:
  $ db-driver sample <dbId> <table>             # 样本数据
  $ db-driver sample <dbId> <table> --limit 5
  $ db-driver sample <dbId> <table> --where "id > 100"
  $ db-driver count <dbId> <table>              # 行数

查询优化:
  $ db-driver explain <dbId> "SELECT ..."       # 执行计划
  $ db-driver explain <dbId> "SELECT ..." --json
  $ db-driver explain <dbId> "SELECT ..." --analyze   # 真正执行并返回实际耗时

Schema:
  $ db-driver schema <dbId>                     # 列表名（轻量）
  $ db-driver schema <dbId> --table <name>      # 看字段
  $ db-driver schema <dbId> --table <name> --show-partitions  # 同时输出分区子表
  $ db-driver schema <dbId> --search user       # 按表名过滤
  $ db-driver schema <dbId> --limit 10 --offset 10  # 翻页：第 11-20 张
  $ db-driver schema <dbId> --limit 200 --json  # 分页 + JSON

SQL 执行:
  $ db-driver execute <dbId> "SELECT ..."        # 表格输出（最多 50 行）
  $ db-driver execute <dbId> "SELECT ..." --limit 200
  $ db-driver execute <dbId> "SELECT ..." --json

配置:
  $ db-driver console                           # 打开网页控制台（连接 + 用法 统一管理）
  $ db-driver config --dbId my-app --type mysql \\
                   --host 127.0.0.1 --user root --password secret \\
                   --database app              # 命令行直接保存一个连接
  $ db-driver install                           # 安装 skill
  $ db-driver update                            # 升级到最新版
  $ db-driver update --check                    # 仅检查不升级
  $ db-driver update 0.2.0                      # 升到指定版本

备份 / 迁移:
  $ db-driver export backup.exp --passphrase 'MyStrongPwd!'    # 加密导出
  $ db-driver export backup.exp --passphrase 'xxx' --no-include-passwords  # 脱敏导出
  $ db-driver import backup.exp --passphrase 'MyStrongPwd!'    # 在新机器导入
  $ db-driver import backup.exp --passphrase 'xxx' --replace   # 替换现有同 dbId

用法笔记 (明文 Markdown，按 dbId 绑定):
  $ db-driver usage list                                  # 列出（默认只显示标题 + 首行预览）
  $ db-driver usage list --dbId my-app --limit 20        # 查某个库 + 限制条数
  $ db-driver usage list --dbId my-app --limit 20 --offset 20  # 翻页：第 21-40 条
  $ db-driver usage list --search "用户"                  # 关键词搜索
  $ db-driver usage detail 3                              # 查看第 3 条完整 Markdown
  $ db-driver usage save --dbId a,b --title "..." --content "..."   # 多 dbId 逗号分隔
  $ db-driver usage save --dbId a --title "..." --content-file ./note.md  # 从文件读
  $ db-driver usage save --dbId a --title "..." --content-file -            # 从 stdin 读
  $ db-driver usage bind --add prd                        # 给所有笔记加 prd 关联
  $ db-driver usage bind --remove staging                 # 给所有笔记删 staging 关联
  $ db-driver usage bind --entries 1,2 --add prd          # 只给指定笔记加
  $ db-driver usage update 3 --content "..."              # 直接更新正文（AI 用，非阻塞）
  $ db-driver usage update 3 --dbIds "a,b,c" --title "新标题"  # 改关联和标题（不改正文）
  $ db-driver usage rm 3                                  # 删除第 3 条
  $ db-driver usage clear --dbId my-app --yes             # 清空某个库

Skill 安装位置: ${SKILL_DEST}
(连接配置加密存储于 OS keyring；具体路径不公开)
`
);

async function shutdown(exitCode: number): Promise<never> {
  // MySQL/PG 连接池会持有 socket 不放，导致 Node 事件循环无法退出
  // 这里显式关闭连接池后强制退出，避免单次命令耗时 30s
  try {
    await clearPoolAsync();
  } catch {
    /* ignore */
  }
  process.exit(exitCode);
}

async function clearPoolAsync(): Promise<void> {
  // 5 秒超时兜底，避免某个 driver.close() 卡死整个退出流程
  await Promise.race([
    clearPoolSafe(),
    new Promise<void>((resolve) => setTimeout(resolve, 2000).unref()),
  ]);
}

function clearPoolSafe(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      clearPool();
    } catch {
      /* ignore */
    }
    resolve();
  });
}

program.parseAsync(process.argv).then(
  async () => {
    const code = typeof process.exitCode === 'number' ? process.exitCode : 0;
    await shutdown(code);
  },
  async (err) => {
    console.error(`\n❌  ${err.message}\n`);
    await shutdown(1);
  }
);