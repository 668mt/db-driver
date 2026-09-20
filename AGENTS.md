# AGENTS.md — db-driver

> 本文件面向所有 AI Agent（Claude / GPT / 本地模型 / 人），是项目的**架构与规范索引**。
> 修改代码前请先读它；改完代码也要回头检查是否违反这里的规定。

---

## 1. 项目概述

`db-driver`（npm 包名 `db-driver`）是一个 **Node.js + TypeScript** 命令行工具，为 AI Agent 提供**带权限管控**的数据库访问能力。

- 支持 **MySQL**、**PostgreSQL**
- 连接配置**加密存储**（AES-256-GCM 二进制），master key 由 **OS keyring** 托管（Windows DPAPI / macOS Keychain / Linux Secret Service），不公开具体路径
- 通过 Web 页面或 CLI flags 配置连接
- 执行 SQL 前用 `node-sql-parser` 解析为 AST，按权限位拦截（**失败安全**）
- 安装 `db-driver install` 会把 `skill/SKILL.md` 同步到 `~/.agents/skills/db-driver/`，让所有 Agent 知道怎么用

**设计目标：**
- 默认安全（最小权限、解析失败就拒绝）
- AI Agent 友好（JSON 输出、表格截断、轻量 schema 列表）
- 人类也好用（中文错误、本地 Web 配置）

---

## 2. 目录结构

```
db-driver/
├── src/
│   ├── cli.ts                # commander 入口；注册所有子命令
│   ├── commands/             # 每个子命令一个文件
│   │   ├── config.ts         # 配置（Web + CLI 双模式）
│   │   ├── list.ts           # 列出连接
│   │   ├── show.ts           # 连接详情
│   │   ├── test.ts           # 测试连接
│   │   ├── remove.ts         # 删除连接
│   │   ├── schema.ts         # 列出表 / 看字段
│   │   ├── sample.ts         # 样本数据（含 formatTable 共用）
│   │   ├── count.ts          # 行数
│   │   ├── execute.ts        # 执行 SQL
│   │   ├── explain.ts        # EXPLAIN 执行计划
│   │   ├── export.ts         # 加密导出配置
│   │   ├── import.ts         # 加密导入配置
│   │   ├── usage.ts          # 用法笔记（list/save/edit/clear/rm）
│   │   └── install.ts        # 安装 skill
│   ├── db/
│   │   ├── index.ts          # DbDriver 接口 + createDriver 工厂
│   │   ├── mysql.ts          # MySQL 实现（mysql2/promise pool）
│   │   ├── postgres.ts       # PostgreSQL 实现（pg.Client）
│   │   ├── pool.ts           # 进程内连接池（30s TTL）
│   │   ├── permissions.ts    # AST 解析 + 权限校验（node-sql-parser）
│   │   └── types.ts          # DbConnectionConfig / QueryResult / SchemaTable 等
│   ├── store/
│   │   ├── configStore.ts    # 配置的加密读写（含 evictDriver 联动）
│   │   └── usageStore.ts     # 用法笔记的 Markdown 读写（明文，按用户要求）
│   ├── utils/
│   │   ├── paths.ts          # CONFIG_DIR / SKILL_DEST / USAGE_FILE 等路径
│   │   ├── crypto.ts         # AES-256-GCM 加密（keyring 用 + passphrase 用）
│   │   ├── ident.ts          # quoteIdent / quoteQualifiedTable
│   │   └── errors.ts         # MySQL errno / PG sqlState → 中文友好提示
│   └── web/
│       ├── server.ts         # config 子命令的本地 HTTP 服务
│       └── public/index.html # 配置页 UI（无外部依赖，纯 HTML+JS）
├── skill/
│   └── SKILL.md              # 安装到 ~/.agents/skills/db-driver/ 的入口
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md                 # ← 你正在看的文件
```

---

## 3. 编码规范

### 3.1 通用规范

| 规则 | 说明 |
|------|------|
| TypeScript | strict 模式，所有代码必须编译通过 |
| 模块 | ESM（`"type": "module"`），import 必须带 `.js` 后缀（即使源是 `.ts`） |
| 文件行数 | **单个文件不超过 600 行**（含空行、注释）；超出就拆分 |
| 字符编码 | UTF-8 |
| 依赖 | 装之前先看 `package.json`；不要重复安装已存在的库 |
| 注释 | 不主动加注释；只写必要且非显而易见的 |

### 3.2 Import 顺序

```
1. Node.js 标准库        (node:* / fs / path / os ...)
2. 第三方库              (commander / open / ws ...)
3. 项目内部 (mt.* / ./ / ../)
```

同组之间按字母序；组与组之间**空一行**。

### 3.3 命名规范

| 元素 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `config-store.ts` |
| 类 / 类型 / 接口 | PascalCase | `DbConnectionConfig` |
| 函数 / 变量 / 方法 | camelCase | `acquireDriver` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_TTL_MS` |
| CLI flag | kebab-case | `--dml-query`, `--no-dml-query` |
| 环境变量 | UPPER_SNAKE_CASE | `DB_DRIVER_HOME` |

### 3.4 错误处理

- 不可恢复错误抛 `Error` 子类或 `RuntimeException`
- 用户输入校验失败抛带明确信息的 `Error`（消息用中文，面向用户）
- IO / 网络错误用 `translateDbError(e, dbType)`（`src/utils/errors.ts`）翻译后再抛出
- **不要静默吞错**，catch 里要么 rethrow、要么打 log

### 3.5 输出格式

- 给**人**看的输出：`console.log` + 表格 / emoji / 中文提示
- 给**AI Agent** 解析的输出：`--json` 时 `console.log(JSON.stringify(...))`，包一层 `{ ok, data }` 或 `{ error }`
- 错误统一走 `❌` 前缀 + 中文消息 + 退出码 ≠ 0

### 3.6 命令行开发（commander）

- 子命令每个一个文件，放 `src/commands/`
- CLI 注册集中在 `src/cli.ts`，**不要**在 command 文件里直接读 `process.argv`
- 必填参数要做校验，缺了就抛中文错误
- `--json` / `--limit` 等通用选项命名要保持一致
- **改了命令必须同步更新**：
  - `src/cli.ts` 的 `program.addHelpText('after', ...)` 示例块
  - `skill/SKILL.md`（被 `install` 命令打包出去）
  - `README.md`

---

## 4. 数据流与关键约定

### 4.1 配置管理（`configStore.ts`）

- **不要**直接 `readFileSync` / `writeFileSync`，统一走 `configStore.ts` 的 `upsertConnection` / `deleteConnection` / `getConnection` / `listConnections`
- 改配置后会自动 `evictDriver(dbId)`，让连接池下次重建
- 文件写入用 `tmp + rename` 原子替换

### 4.2 连接池（`pool.ts`）

- **入口** `acquireDriver(config)`：30 秒 TTL，同 dbId 复用
- 命令完成后**不要**手动 `driver.close()`，由 `cli.ts` 的 `shutdown()` 统一清理
- 改 pool 配置前必读 `shutdown()` 的 2 秒兜底逻辑，避免改坏导致进程无法退出

### 4.2.1 PostgreSQL schema

- PG 一级连接是 **database（catalog）**，二级是 **schema（namespace）**
- `config.database` → `pg.Client.database`（连接哪个库）
- `config.schema` → `pg_namespace.nspname`（默认 `'public'`）
- 旧配置缺 `schema` 字段时，driver 内部默认 `'public'`，向后兼容
- `schema` 命令 `--schema <name>` 可临时覆盖配置

### 4.3 权限校验（`permissions.ts`）

- 所有 SQL 执行前**必须**走 `checkSqlPermission(sql, permissions, dbType)`
- 解析失败 → `dangerous` → 拒绝（**不**允许 fallback 到正则）
- 多语句 / 空 AST / 未知类型 → `dangerous` → 拒绝
- 危险语句（`CALL` / `LOAD` / `PREPARE` / `EXECUTE` / `DO` / `SET`）映射到 `dangerous`，要求 `ddl` 权限

### 4.4 错误本地化（`errors.ts`）

- 新增 DB 错误码时同步更新 `MYSQL_ERROR_MAP` / `PG_SQLSTATE_MAP`
- 翻译函数返回 `${友好提示}（${原始消息}）`，保留原始信息便于排查
- 所有命令的 catch 块**必须**走 `translateDbError`

---

## 5. 扩展指南

### 5.1 新增数据库类型

1. 在 `src/db/types.ts` 的 `DbType` 加入新类型
2. 在 `src/db/index.ts` 的 `createDriver` 加 case
3. 新建 `src/db/<type>.ts` 实现 `DbDriver` 接口
4. 在 `src/utils/errors.ts` 加错误码表
5. 在 `src/commands/config.ts` 的 `DEFAULT_PORTS` 加默认端口
6. 在 `src/commands/explain.ts` 的 `buildExplainSql` 加 EXPLAIN 语法
7. 同步 `skill/SKILL.md` 和 `README.md`

### 5.2 新增子命令

1. 新建 `src/commands/<name>.ts`，导出 `run<Name>(args, options)`
2. 在 `src/cli.ts` 用 `program.command('<name> ...').action(...)` 注册
3. 在 `src/cli.ts` 的 `addHelpText('after')` 加示例
4. **同步**：`skill/SKILL.md` + `README.md`
5. 加 build → 跑 `db-driver <name> --help` 验证

### 5.3 改动既有命令

1. 修改 `src/commands/<name>.ts`
2. **同步**：`skill/SKILL.md`（Agent 通过 skill 知道用法）+ `README.md`（人通过 README 知道用法）+ `cli.ts` 的帮助文本
3. 如果改了 SQL 语义或权限映射，检查 `src/db/permissions.ts` 是否需要同步
4. 如果改了连接结构，检查 `src/web/public/index.html` 是否要同步

---

## 6. 提交流程

修改代码后，按以下顺序自检：

```bash
cd D:/work/idea_workspace/ai-studio/db-driver

# 1. 编译
npm run build

# 2. 重新安装 skill（改了 skill/SKILL.md 必须执行）
db-driver install

# 3. 单命令冒烟
db-driver list
db-driver test <dbId>

# 4. 验证关键功能
db-driver schema <dbId> --limit 5
db-driver sample <dbId> <table> --limit 2
db-driver count <dbId> <table>
db-driver execute <dbId> "SELECT 1"
db-driver explain <dbId> "SELECT 1" --json
```

**改了命令 → 改 `skill/SKILL.md` → 改 `README.md` → 改 `cli.ts` 帮助文本 → `npm run build` → `db-driver install`。** 漏一步就重做。

---

## 7. 测试与验证

- **无单元测试框架**——这是 CLI 工具，靠真实数据库冒烟
- 真值库：`mukeyuan-dev`（已配置）——跑任意 SQL 前 `db-driver test mukeyuan-dev`
- 权限拦截对抗测试见 `skill/SKILL.md` 故障排查段落（注释断字 / 条件注释 / 多语句 / CALL）

---

## 8. 已知约束

- 单进程内同 dbId 共用一个连接池（30 秒 TTL）；跨进程不共享
- 配置文件是**加密二进制**（AES-256-GCM）；key 由 OS keyring 托管，**不可移植**（系统重装后需要重新 config）
- `node-sql-parser` 89MB（首次安装慢）；只 `execute` / `sample` / `count` / `explain` 命令按需加载
- 不支持 MSSQL / Oracle / SQLite（按需扩展）
- `multipleStatements: false`，单次只能执行一条语句

---

## 9. 发布到 npm

包名 `db-driver`（裸名，非 scoped），直接 `npm publish` 即可，无需 `--access public`。

### 9.1 一次性准备

```bash
# 注册账号：https://www.npmjs.com/signup
npm login                          # 输入 username / password / email / 2FA 码
npm whoami                         # 验证登录
```

强烈建议开启 2FA（账户 → Security → Two-Factor Authentication）。

### 9.2 每次发布的标准流程

```bash
cd D:/work/idea_workspace/ai-studio/db-driver

# 1. 拉最新代码 + 装依赖
git pull
npm install

# 2. 本地冒烟（按 §6 走一遍）

# 3. 编译
npm run build

# 4. 预览 tarball 内容（确认 dist/ 有、node_modules 没有）
npm pack --dry-run

# 5. 改版本号 + 发布（一键脚本）
npm run release:patch              # 0.1.0 → 0.1.1（修 bug）
# 或 npm run release:minor        # 0.1.0 → 0.2.0（新功能）
# 或 npm run release:major        # 0.1.0 → 1.0.0（破坏性变更）
# 等价于：npm version <level> && npm publish

# 6. 首次发布 / 跨作用域：必须带 --access public
npm publish --access public

# 7. 推代码 + tag
git push --follow-tags

# 8. 验证
npm view db-driver
npm install -g db-driver
db-driver --version
```

### 9.3 版本号规则

- `patch`（0.0.X）：向后兼容的 bug 修复
- `minor`（0.X.0）：向后兼容的新功能
- `major`（X.0.0）：破坏性变更（改了命令语义、permission 位、config 格式等需要 major bump）

### 9.4 发布内容控制（`package.json` 的 `files` 字段）

只发布以下目录：
```json
"files": ["dist", "skill"]
```

**自动排除**：`src/`、`node_modules/`、`test/`、`AGENTS.md`、`*.log`。需要看完整白名单就 `npm pack --dry-run`。

### 9.5 常见操作

| 场景 | 命令 |
|------|------|
| 撤回（**72h 内**，且没人下载） | `npm unpublish db-driver@0.1.0 -f` |
| 弃用某个版本 | `npm deprecate db-driver@0.1.0 "reason"` |
| 发 beta / next | `npm publish --tag beta`（默认 tag 是 `latest`） |
| 看历史版本 | `npm view db-driver versions` |
| 看包元信息 | `npm view db-driver` |

### 9.6 坑点提醒

- `prepublishOnly` 已配好 `npm run build`，**不要**改这个钩子去跳过编译
- 发版前**检查** `git status` 干净、`git log` 干净；半成品不能上版本
- 跨平台路径警告（CRLF/LF）来自 Windows 编辑器，commit 里看到无所谓，不要去改文件换行
- `package-lock.json` 必须提交，保证 npm 安装时拿到确定的依赖树