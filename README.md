# db-driver

> **让 AI Agent 安全使用 MySQL / PostgreSQL 的 CLI 工具。**
> 通过 `node-sql-parser` 做 AST 级权限校验，配 `~/.agents/skills/db-driver/` 一键安装到所有 Agent。

[![npm version](https://img.shields.io/npm/v/db-driver.svg)](https://www.npmjs.com/package/db-driver)
[![npm downloads](https://img.shields.io/npm/dm/db-driver.svg)](https://www.npmjs.com/package/db-driver)
[![license](https://img.shields.io/npm/l/db-driver.svg)](https://github.com/668mt/db-driver)
[![node](https://img.shields.io/node/v/db-driver.svg)](https://www.npmjs.com/package/db-driver)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![GitHub stars](https://img.shields.io/github/stars/668mt/db-driver.svg)](https://github.com/668mt/db-driver/stargazers)

[English](./README.en.md) · [简体中文](#)

---

## 为什么需要它

让 AI 直接拼 SQL 是有风险的：

- 注释断字 `U/**/PDATE` 绕过简单正则检测
- 存储过程 `CALL proc()` 可以做任何事
- 一句写错的 SQL 改坏了生产数据

`db-driver` 把 SQL 喂给 **AST 解析器**（`node-sql-parser`），按权限位拦截，配 **JSON 输出 / 加密存储 / Agent skill** 给 AI Agent 用——**最少上下文、最高可控、失败安全**。

## 特性

- 🛡️ **AST 级权限校验** — 4 个权限位（query / update / delete / ddl），解析失败一律拒绝
- 🔐 **加密存储** — AES-256-GCM 二进制 + master key 由 OS keyring 托管（Windows DPAPI / macOS Keychain / Linux Secret Service）
- 🤖 **AI Agent 原生** — `db-driver install` 把 skill 装到 `~/.agents/skills/db-driver/`，所有 Agent 自动学会用法
- 🗃️ **MySQL & PostgreSQL** — PG 多 schema、MySQL 分区表、`EXPLAIN` / `EXPLAIN ANALYZE`
- 💻 **双模式配置** — 网页控制台（React UI）或 CLI flags（适合脚本）
- 📝 **用法笔记** — 按 `dbId` 绑定 SQL 习惯，明文 SQLite 存储（不含密码，可分享）
- 🔁 **备份与迁移** — 加密导出（PBKDF2 / AES-256-GCM），跨机器可恢复

## 📑 目录

- [30 秒上手](#30-秒上手)
- [给 AI Agent 用：skill 工作流](#给-ai-agent-用skill-工作流)
- [禁用连接](#禁用连接)
- [权限模型](#权限模型)
- [配置详解](#配置详解)
- [命令一览](#命令一览)
- [错误信息本地化](#错误信息本地化)
- [故障排查](#故障排查)
- [架构](#架构)
- [开发](#开发)
- [发布](#发布)
- [License](#license)

## ⚡ 一键安装 skill（无需预装 db-driver）

只想让 AI Agent 立刻学会 db-driver 的用法、还没正式安装？一行命令把 skill 装到 `~/.agents/skills/db-driver/`，**不需要预装 db-driver 本体**：

```bash
npx -y db-driver@latest install
```

适合：

- 🤖 AI Agent 在用户机器上首次出现，临时把 skill 喂给本地的 Agent 工具（Claude Code、IDE agent 等）
- 🧪 想先看 `SKILL.md` 内容再决定是否正式安装
- 🚀 CI / 脚本环境里不想 `npm install -g` 污染全局

> 跑完这条命令后，Agent 就能识别 `db-driver ...` 命令；需要真正执行 SQL 时再 `npm install -g db-driver` 即可。

## 30 秒上手

```bash
# 1. 安装
npm install -g db-driver

# 2. 给 AI 配置一个 DB 连接（建议用只读账号）
db-driver config --dbId my-app \
  --type mysql --host 127.0.0.1 --port 3306 \
  --user reader --password secret --database mydb

# 3. 让 AI 自动装上 skill（也可省略——上面的 npx 命令已装过）
db-driver install

# 4. AI 开始查询
db-driver schema my-app
db-driver execute my-app "SELECT * FROM users LIMIT 5" --json
```

## 给 AI Agent 用：skill 工作流

`db-driver install` 会把 `skill/SKILL.md` 写入 `~/.agents/skills/db-driver/`。之后任何支持 skills 的 Agent 工具（Claude Code、本地 IDE agent 等）都能自动发现并学会这套命令。

**AI 拿到任务时的标准流程：**

1. `db-driver list` → 知道有哪些 dbId 可用
2. `db-driver schema <dbId>` → 列出表名（轻量，不爆上下文）
3. `db-driver schema <dbId> --table <name>` → 找具体表的字段 + 索引
4. `db-driver sample <dbId> <table>` / `count <dbId> <table>` → 看样本 / 统计
5. `db-driver execute <dbId> "<SQL>" --json` → 跑查询
6. 需要改表结构？→ `db-driver execute <dbId> "<DDL>"`（需要 `ddl` 权限）

**给 AI 的最佳实践：**

- **永远加 `--json`** — Agent 解析 JSON 比解析表格稳
- **永远带 `--limit`** — 默认 50 行，防爆炸
- **不确定时先 schema** — 别瞎写列名 / 表名
- **写操作前先 count** — 确认影响范围

## 禁用连接

除了 4 个权限位，每个连接还有一个**启用开关**。禁用后，该连接上的**任何数据访问**都会被拒绝：

```bash
db-driver disable my-app-prd     # 禁用
db-driver enable  my-app-prd     # 重新启用
```

- 被禁用的连接上，`schema` / `sample` / `count` / `execute` / `script` / `explain` / `test` 全部报「数据库连接已被禁用」。
- **配置与权限位全部保留** —— 禁用只是把数据访问锁上，随时可以再启用（不会丢失账号密码）。
- `db-driver list` / `show` 仍可查看，并会标出「🔒 已禁用」。
- 网页控制台里也有开关：连接列表上的锁形按钮，或连接编辑页的「启用」勾选框。
- MCP 的 `db_execute` / `db_script` 等工具对禁用连接同样拒绝；`db_set_connection_enabled` 可以从 MCP 侧开关。

> 典型用法：把生产库的连接禁掉，AI 就完全碰不到生产数据了 —— 这比逐条收紧权限位更省心。

## 权限模型

**核心设计：每个连接保存时绑定 4 个权限位，执行 SQL 前做权限校验。**

| 权限位 | 默认值 | 允许的 SQL 类型 |
|--------|--------|----------------|
| `dmlQuery` | ✅ true | `SELECT` / `SHOW` / `DESCRIBE` / `EXPLAIN` |
| `dmlUpdate` | ❌ false | `INSERT` / `UPDATE` / `REPLACE` / `MERGE` |
| `dmlDelete` | ❌ false | `DELETE` |
| `ddl` | ❌ false | `CREATE` / `ALTER` / `DROP` / `TRUNCATE` / `RENAME` 等 |

任何 SQL 执行前都会走这个流程：

```
SQL 文本
   ↓
node-sql-parser 解析为 AST
   ↓
解析失败？→ ❌ 拒绝（防注释断字 / 条件注释等绕过）
   ↓
AST 类型 → 映射到 4 个权限位之一
   ↓
权限位开启？→ ✅ 执行
权限位关闭？→ ❌ 拒绝并打印「<操作> 已被禁用」
```

### 能挡住什么

| 攻击 | 拦截方式 |
|------|----------|
| `UPDATE users SET ...` | AST 识别为 update + `dmlUpdate` 未开 |
| `U/**/PDATE users ...` | 注释断字 → parser 失败 → 拒绝 |
| `/*! UPDATE */ users ...` | MySQL 条件注释 → parser 失败 → 拒绝 |
| `CALL dangerous_proc()` | AST 识别为 call → 要求 `ddl` 权限 |
| `LOAD DATA INFILE ...` | AST 识别为 load → 要求 `ddl` 权限 |
| `PREPARE stmt FROM '...'` | AST 识别为 prepare → 要求 `ddl` 权限 |
| 多语句 `SELECT 1; DROP TABLE x` | parser 返回多条语句 → 拒绝 |
| 语法错误 / 解析失败 | 一律 dangerous → 拒绝 |

### 挡不住什么（必须靠「最小权限 DB 账号」兜底）

- 数据库触发器：SELECT 自动触发 INSERT/UPDATE
- 用 `root` / `superuser` 账号 → 任何工具都拦不住直接 `psql` / `mysql` 连
- AI 改其它通道（直接 psql、SSH、Web 面板）

**👉 终极建议：用最小权限的 DB 账号配置 db-driver**

```sql
-- MySQL 只读账号示例
CREATE USER 'reader'@'%' IDENTIFIED BY 'xxx';
GRANT SELECT ON mydb.* TO 'reader'@'%';

-- 写权限账号（谨慎）
CREATE USER 'writer'@'%' IDENTIFIED BY 'yyy';
GRANT SELECT, INSERT, UPDATE ON mydb.* TO 'writer'@'%';
```

把 `reader` 配进 `db-driver` 给日常查询，需要写时再单独配 `writer`。

## 配置详解

两种方式，二选一：

### 方式 A：命令行 flags（适合脚本）

```bash
db-driver config \
  --dbId my-app \
  --type mysql \
  --host 127.0.0.1 --port 3306 \
  --user root --password secret \
  --database app \
  --dml-query --dml-update --ddl \
  --test     # 保存前先 ping
```

必填：`--dbId --type --host --user --password --database`
可选：`--port`（按类型默认）、权限开关、`--test`、`--schema`（PG）、`--description`

### PostgreSQL 多 schema 支持

PG 一个 catalog 内有多个 schema（如 `public`、`tenant_1`）。`db-driver` 默认按 `public` 处理：

```bash
db-driver config --dbId my-app \
  --type postgres --host ... --database mydb \
  --schema tenant_1              # 默认 public，可指定
  --description "生产 - 租户1"   # 可选，便于区分多套环境
```

`schema` 命令支持临时覆盖：

```bash
db-driver schema my-app --schema tenant_1
db-driver schema my-app --schema tenant_1 --table orders
```

### 方式 B：网页控制台（适合人）

```bash
db-driver console
```

浏览器打开 `http://127.0.0.1:7842`，可视化增删改连接配置、勾选权限、查看表结构、编辑 SQL 用法笔记、测试连接等。Ctrl+C 退出。

### 配置存储格式（加密）

连接配置用 **AES-256-GCM** 加密二进制存储，**master key 由 OS keyring 托管**（Windows DPAPI / macOS Keychain / Linux Secret Service）。

- 不存在明文 JSON，密码字段不被机器单独抽取
- 配置文件不公开具体路径
- 系统重装 / 换用户后 keyring 中的 key 会丢失，配置需重新 config（设计如此：密钥不跨机器迁移）
- 没有手动编辑入口；统一通过 `db-driver config`（CLI）或 `db-driver console`（网页）修改

```jsonc
// 配置内容示例（实际是加密二进制）—— 仅供理解结构
{
  "version": 1,
  "connections": [
    {
      "dbId": "my-app",
      "type": "mysql",
      "host": "127.0.0.1",
      "port": 3306,
      "user": "reader",
      "password": "...",
      "database": "mydb",
      "schema": null,           // PG 专用，可选
      "description": null,      // 连接描述，可选
      "permissions": {
        "dmlQuery": true,
        "dmlUpdate": false,
        "dmlDelete": false,
        "ddl": false
      },
      "createdAt": "2026-09-19T...",
      "updatedAt": "2026-09-19T..."
    }
  ]
}
```

## 命令一览

### 连接管理

| 命令 | 说明 |
|------|------|
| `db-driver console [--port N]` | 打开网页控制台（连接 + 用法，默认 7842 端口） |
| `db-driver config --dbId x --type ...` | 命令行快速保存连接（适合脚本） |
| `db-driver list` | 列出所有 dbId |
| `db-driver show <dbId>` | 看连接详情（密码默认隐藏，`--reveal-password` 显示明文） |
| `db-driver test <dbId>` | 测试连通性 |
| `db-driver remove <dbId> --yes` | 删除连接 |
| `db-driver disable <dbId>` | 禁用连接（任何数据访问都被拒绝；配置与权限保留） |
| `db-driver enable <dbId>` | 重新启用连接 |
| `db-driver export <file> [--passphrase <pwd>]` | 导出所有连接到文件（passphrase 留空 = 明文 JSON；≥8 位 = 加密 `.exp`） |
| `db-driver import <file> [--passphrase <pwd>] [--replace]` | 从文件导入连接（同名 dbId 默认跳过，`--replace` 覆盖） |

### 数据浏览

| 命令 | 说明 |
|------|------|
| `db-driver schema <dbId>` | 列表名（第一步必走） |
| `db-driver schema <dbId> --table <t>` | 看字段 + 索引 + 注释 |
| `db-driver schema <dbId> --table <t> --show-partitions` | 同时输出 MySQL 分区子表信息 |
| `db-driver schema <dbId> --search <p>` | 按表名模糊过滤 |
| `db-driver schema <dbId> --schema <s>` | PG 临时切换 schema（覆盖配置默认） |
| `db-driver schema <dbId> --limit N --offset M` | 列表分页（total / offset / limit 都在输出里） |
| `db-driver sample <dbId> <table>` | 样本数据（默认 10 行） |
| `db-driver count <dbId> <table>` | 行数 |
| `db-driver execute <dbId> "<SQL>" --json` | 跑查询（带 JSON 输出） |
| `db-driver execute <dbId> "<SQL1>; <SQL2>"` | 多条语句（分号分隔），逐条做权限校验 |
| `db-driver execute <dbId> "<SQL>" --continue-on-error` | 某条失败后继续执行后面的 |
| `db-driver explain <dbId> "<SQL>"` | 执行计划（不执行） |
| `db-driver explain <dbId> "<SQL>" --analyze` | 真正执行并返回耗时 |

### 批量执行脚本

| 命令 | 说明 |
|------|------|
| `db-driver script <dbId> <file.sql>` | 执行 .sql 脚本：按顶层分号拆成多条语句，逐条做权限校验后顺序执行 |
| `db-driver script <dbId> <file.sql> --dry-run` | 只校验权限、不真正执行（预检） |
| `db-driver script <dbId> <file.sql> --continue-on-error` | 某条失败后继续 |
| `db-driver script <dbId> <file.sql> --json` | JSON 输出（含每条语句的 SQL / 结果 / 错误） |

- 拆分识别：单/双/反引号字符串、`--` 与 `#` 行注释、C 风格块注释、PostgreSQL 的 `$$dollar$$`；字符串里的分号不切分。
- 支持 MySQL 客户端的 `DELIMITER $$` 指令（存储过程里的分号不会被误切）。
- **每条语句单独走 AST 权限校验**，整包不会一次性放行；已成功的语句不会自动回滚。

### MCP server（stdio）

```bash
db-driver mcp     # 以 stdio 方式启动 MCP server
```

在 MCP 客户端（如 OpenCode / Claude Code）里注册：

```json
{
  "mcp": {
    "db-driver": {
      "command": "db-driver",
      "args": ["mcp"]
    }
  }
}
```

| 工具 | 说明 |
|------|------|
| `db_list_connections` | 列出所有连接（不含密码） |
| `db_set_connection_enabled` | 启用 / 禁用连接 |
| `db_schema` | 列表名 / 看字段 + 索引 |
| `db_sample` | 样本数据（可带 WHERE） |
| `db_count` | 行数（可带 WHERE） |
| `db_execute` | 执行 SQL（支持多条语句），可 dryRun / continueOnError |
| `db_script` | 执行 .sql 脚本文件，可 dryRun |
| `db_explain` | 执行计划（analyze=true 才真正执行） |

### 用法笔记（明文 Markdown，一条笔记可关联多个 dbId）

| 命令 | 说明 |
|------|------|
| `db-driver usage list` | 列出（默认只显示标题 + 首行预览） |
| `db-driver usage list --dbId a,b` | 过滤（逗号分隔，OR 匹配） |
| `db-driver usage list --search <kw>` | 关键词搜索（title / dbIds / content） |
| `db-driver usage list --limit N --offset M` | 翻页 |
| `db-driver usage detail <index>` | 查看某条完整 Markdown |
| `db-driver usage save --dbId a,b --title "..." --content "..."` | 新增（多 dbId 逗号分隔） |
| `db-driver usage save --dbId a --title "..." --content-file ./note.md` | 从文件读内容 |
| `db-driver usage save --dbId a --title "..." --content-file -` | 从 stdin 读 |
| `db-driver usage update <index> --title/--content/--dbIds` | 更新（AI 友好，字段可省略） |
| `db-driver usage update <index> --content-file ./new.md` | 从文件读新内容 |
| `db-driver usage bind --add prd` | 批量给所有笔记加 `prd` 关联 |
| `db-driver usage bind --remove staging` | 批量给所有笔记删 `staging` 关联 |
| `db-driver usage bind --entries 1,2,3 --add a` | 只给指定序号加 |
| `db-driver usage rm <index>` | 删除 |
| `db-driver usage clear [--dbId <id>] --yes` | 清空（可指定 dbId） |

### 安装 / 自更新

| 命令 | 说明 |
|------|------|
| `db-driver install` | 把 skill 装到 `~/.agents/skills/db-driver/` |
| `db-driver update` | 从 npm 自更新（拒绝源码 link 模式） |
| `db-driver update --check` | 仅检查是否有新版 |

### 通用选项

- `--json` — 所有查询类命令都支持，AI 解析用
- `--limit N` — `execute` / `sample` 限制返回行数（默认 50 / 10）；`schema` / `usage list` 列表分页
- `--offset M` — `schema` / `usage list` 列表分页（与 `--limit` 配合翻页）
- `--where <expr>` — `sample` / `count` 附加 WHERE 条件

## 错误信息本地化

所有 DB 错误自动翻译为中文，格式 `中文提示（原始错误消息）`，便于排查：

### MySQL 错误码

| 错误码 | 翻译 |
|--------|------|
| 1044 | 访问被拒绝：当前用户无权访问该数据库 |
| 1045 | 访问被拒绝：用户名或密码错误 |
| 1049 | 数据库不存在 |
| 1054 | 未知列 |
| 1062 | 唯一键冲突（重复插入） |
| 1064 | SQL 语法错误 |
| 1141 / 1142 | 权限不足 |
| 1146 | 表不存在 |
| 1205 | 锁等待超时 |
| 1213 | 死锁，请重试 |
| 2002 | 无法连接到数据库主机（连接被拒绝） |
| 2003 | 无法连接到数据库主机（端口不可达） |
| 2013 | 连接丢失（网络问题或查询超时） |
| ECONNREFUSED | 连接被拒绝：检查 host / port 是否正确，数据库服务是否启动 |

### PostgreSQL SQLSTATE

| SQLSTATE | 翻译 |
|----------|------|
| 08000 / 08001 / 08003 / 08006 | 连接异常 / 失败 |
| 23502 | 非空约束违反 |
| 23503 | 外键约束违反 |
| 23505 | 唯一键冲突（重复插入） |
| 28P01 | 身份验证失败：用户名或密码错误 |
| 3D000 | 数据库（catalog）不存在 |
| 40P01 | 死锁，请重试 |
| 42501 | 权限不足 |
| 42601 | SQL 语法错误 |
| 42703 | 列不存在 |
| 42P01 | 表或视图不存在 |
| 55P03 | 锁等待超时，请稍后重试 |

## 故障排查

| 现象 | 排查 |
|------|------|
| 命令不存在 | `npm install -g db-driver` 没跑 / PATH 不对 |
| 连接不存在 | `db-driver list` 看可用 dbId |
| 权限被拒（"已被禁用"） | `db-driver show <dbId>` 看实际权限位；错误消息附带 `SELECT=... UPDATE=... DELETE=... DDL=...`；**手动用 `db-driver config` 调整**（不要让 AI 自动调） |
| SELECT 报权限不足但理应通过 | 错误消息会附带当前权限，确认 `dmlQuery=true`；可能 SQL 被 AST 识别成其他类型（用 `--json` + `node-sql-parser` 排查） |
| 表 / 列不存在 | `db-driver schema <dbId> --search <keyword>` |
| PG schema 找不到表 | `db-driver show <dbId>` 确认 schema 字段；可用 `--schema` 临时切换 |
| 列表太多想翻页 | `schema` / `usage list` 加 `--limit N --offset M` |
| 想看 MySQL 分区子表 | `schema <dbId> --table <t> --show-partitions` |
| 无法解析 SQL | 含注释断字 / 条件注释，已被拒绝（设计如此） |
| 笔记想批量加 dbId | `usage bind --add <dbId>`（一次性应用到所有笔记） |
| 笔记想单条改 dbId / title | `usage update <index> --title ... --dbIds a,b`（AI 友好，非阻塞） |
| 进程卡住 | MySQL / PG 连接池问题；`db-driver update` 拉到最新版试试；`npm run dev:stop` 清理残留 |

## AI Agent 协作红线

如果由 AI Agent 在调用本工具：

- **禁止自行提升权限** —— 权限被拒时不要自动跑 `db-driver config` 加新权限
- **提权必须用户明确同意** —— 只有用户亲口说"开 XX 权限"才能给新的 config 命令
- **失败立即停下并报告** —— 不要尝试第二条路径蒙混
- **不要直接编辑配置文件** —— 让用户自己用 `db-driver config`

完整版见 `skill/SKILL.md`（AI Agent 实际加载的入口）。

## 架构

```
db-driver/
├── src/
│   ├── cli.ts                       # commander 入口
│   ├── commands/                    # 每个子命令一个文件
│   │   ├── config.ts                # 配置（Web + CLI 双模式）
│   │   ├── list/show/test/remove.ts # 连接管理
│   │   ├── schema/sample/count.ts   # 数据浏览
│   │   ├── execute.ts               # SQL 执行 + AST 权限校验（支持多条语句）
│   │   ├── script.ts                # .sql 脚本文件批量执行
│   │   ├── explain.ts               # EXPLAIN / EXPLAIN ANALYZE
│   │   ├── export.ts / import.ts    # 加密导出导入
│   │   ├── usage.ts                 # 用法笔记
│   │   └── install/update.ts        # skill 安装 / npm 自更新
│   ├── db/
│   │   ├── index.ts                 # DbDriver 接口 + createDriver 工厂
│   │   ├── mysql.ts                 # MySQL 实现（mysql2/promise）
│   │   ├── postgres.ts              # PostgreSQL 实现（pg.Client）
│   │   ├── pool.ts                  # 进程内连接池（30s TTL）
│   │   ├── permissions.ts           # AST 解析 + 权限校验
│   │   ├── sqlSplit.ts              # 脚本按顶层分号拆分（保留注释，防绕过）
│   │   ├── batch.ts                 # 批量执行引擎（逐条权限校验）
│   │   └── types.ts                 # DbConnectionConfig 等共享类型
│   ├── mcp/
│   │   ├── server.ts                # stdio MCP server（工具注册）
│   │   ├── tools.ts                 # MCP 工具实现
│   │   └── scriptTool.ts            # MCP 版脚本执行工具
│   ├── store/
│   │   ├── configStore.ts           # AES-256-GCM 加密连接配置
│   │   └── usageStore.ts            # 用法笔记（明文 SQLite）
│   ├── utils/
│   │   ├── paths.ts                 # 配置 / skill 路径
│   │   ├── crypto.ts                # AES-256-GCM 加解密
│   │   ├── ident.ts                 # 表名 / 列名引用
│   │   └── errors.ts                # 错误码中英文翻译
│   └── web/                         # db-driver console 的本地网页（React + Vite）
│       ├── server.ts                # 本地 HTTP 服务（连接 + 用法 API）
│       ├── index.html
│       └── src/                     # React 组件
├── skill/SKILL.md                   # AI Agent 看到的入口
├── README.md / README.en.md         # 本文件 / English version
└── AGENTS.md                        # 架构与规范（给后续贡献者）
```

## 开发

```bash
git clone https://github.com/668mt/db-driver.git
cd db-driver
npm install
npm run build         # 编译到 dist/
npm link              # 全局链接 → db-driver 命令可用
```

修改代码后必跑：

```bash
npm run build                   # 编译
db-driver install               # 同步 skill（命令改了必跑）
```

完整规范见 [AGENTS.md](./AGENTS.md)。

## 发布

```bash
# 改版本 + 编译 + 发布
npm run release:patch           # 0.1.0 → 0.1.1
# 或 minor / major

# 推送代码 + tag
git push --follow-tags
```

发布后用户用 `db-driver update` 升级。

## Contributing

欢迎 PR / Issue：

- 🐛 **Bug 报告**：附上 `db-driver --version`、复现命令、完整错误输出
- 💡 **功能建议**：先在 Issue 里讨论设计，避免 PR 方向跑偏
- 🔧 **代码提交**：改动后跑 `npm run build` + `db-driver install`，更新 README / SKILL.md / AGENTS.md

完整流程见 [AGENTS.md](./AGENTS.md)（含发布到 npm 的步骤）。

## License

MIT © [668mt](https://github.com/668mt) — see [`package.json`](./package.json) (`"license": "MIT"`)
