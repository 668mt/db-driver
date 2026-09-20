# db-driver

> 让 AI Agent 安全使用 MySQL / PostgreSQL 的 CLI 工具 — 通过 `~/.agents/skills/db-driver` skill 一键安装。
>
> npm 包 `db-driver` · CLI 命令 `db-driver` · 本地配置 `~/.db-driver/config.json`

## 为什么需要它

让 AI 直接拼 SQL 是有风险的：

- 注释断字 `U/**/PDATE` 绕过简单正则检测
- 存储过程 `CALL proc()` 可以做任何事
- 一句写错的 SQL 改坏了生产数据

`db-driver` 用 **AST 解析器**（`node-sql-parser`）做 SQL 权限校验，配 **JSON 输出** 给 AI Agent 用，最少上下文、最高可控。

## 30 秒上手

```bash
# 1. 安装
npm install -g db-driver

# 2. 给 AI 配置一个 DB 连接（只读账号更安全）
db-driver config --dbId my-app \
  --type mysql --host 127.0.0.1 --port 3306 \
  --user reader --password secret --database mydb

# 3. 让 AI 自动装上 skill
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
- **不确定时先 schema** — 别瞎写列名/表名
- **写操作前先 count** — 确认影响范围

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
| `UPDATE users SET ...` | AST 识别为 update + dmlUpdate 未开 |
| `U/**/PDATE users ...` | 注释断字 → parser 失败 → 拒绝 |
| `/*! UPDATE */ users ...` | MySQL 条件注释 → parser 失败 → 拒绝 |
| `CALL dangerous_proc()` | AST 识别为 call → 要求 ddl 权限 |
| `LOAD DATA INFILE ...` | AST 识别为 load → 要求 ddl 权限 |
| `PREPARE stmt FROM '...'` | AST 识别为 prepare → 要求 ddl 权限 |
| 多语句 `SELECT 1; DROP TABLE x` | parser 返回多条语句 → 拒绝 |
| 语法错误 / 解析失败 | 一律 dangerous → 拒绝 |

### 挡不住什么（必须靠「最小权限 DB 账号」兜底）

- 数据库触发器：SELECT 自动触发 INSERT/UPDATE
- 用 `root` / `superuser` 账号 → 任何工具都拦不住直接 psql/mysql 连
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
可选：`--port`（按类型默认）、权限开关、`--test`、`--web`（直接打开网页）

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

### 方式 B：网页（适合人）

```bash
db-driver config --web
```

浏览器打开 `http://127.0.0.1:<随机端口>`，可视化增删改、勾选权限、保存。关闭浏览器 CLI 自动退出。

### 配置文件位置

`~/.db-driver/config.json`（明文 JSON，可手动编辑或用 git 备份）：

```json
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

`schema`（PG 专用，可选）、`description`（连接描述，可选）是 0.2.0 起新增的字段，旧配置文件读取时向后兼容（缺省等同于未设置）。

## 命令一览

| 命令 | 何时用 |
|------|--------|
| `db-driver config --web` | 可视化配置连接（适合人） |
| `db-driver config --dbId x --type ...` | 命令行快速保存连接（适合脚本） |
| `db-driver list` | 列出所有 dbId |
| `db-driver show <dbId>` | 看连接详情（密码默认隐藏） |
| `db-driver test <dbId>` | 测试连通性 |
| `db-driver remove <dbId> --yes` | 删除连接 |
| `db-driver schema <dbId>` | 列表名（第一步必走） |
| `db-driver schema <dbId> --table <t>` | 看字段 + 索引 |
| `db-driver schema <dbId> --search <p>` | 按表名模糊过滤 |
| `db-driver schema <dbId> --schema <s>` | PG 临时切换 schema（覆盖配置默认） |
| `db-driver sample <dbId> <table>` | 样本数据（默认 10 行） |
| `db-driver count <dbId> <table>` | 行数 |
| `db-driver execute <dbId> "<SQL>" --json` | 跑查询（带 JSON 输出） |
| `db-driver explain <dbId> "<SQL>"` | 执行计划（不执行） |
| `db-driver explain <dbId> "<SQL>" --analyze` | 真正执行并返回耗时 |
| `db-driver install` | 把 skill 装到 `~/.agents/skills/db-driver/` |
| `db-driver update` | 从 npm 自更新（拒绝源码 link 模式） |
| `db-driver update --check` | 仅检查是否有新版 |

### 通用选项

- `--json` — 所有查询类命令都支持，AI 解析用
- `--limit N` — `execute` / `sample` 限制返回行数（默认 50 / 10）
- `--where <expr>` — `sample` / `count` 附加 WHERE 条件

## 错误信息本地化

所有 DB 错误自动翻译为中文：

| 错误码 | 翻译 |
|--------|------|
| MySQL 1045 / PG 28P01 | 访问被拒绝：用户名或密码错误 |
| MySQL 1049 / PG 3D000 | 数据库不存在 |
| MySQL 1146 / PG 42P01 | 表不存在 |
| MySQL 1054 / PG 42703 | 未知列 |
| MySQL 1064 / PG 42601 | SQL 语法错误 |
| MySQL 1213 / PG 40P01 | 死锁，请重试 |
| ECONNREFUSED | 连接被拒绝：检查 host/port |

## 故障排查

| 现象 | 排查 |
|------|------|
| 命令不存在 | `npm install -g db-driver` 没跑 / PATH 不对 |
| 连接不存在 | `db-driver list` 看可用 dbId |
| 权限被拒 | `db-driver show <dbId>` 看权限位；**手动用 `db-driver config` 调整**（不要让 AI 自动调） |
| 表/列不存在 | `db-driver schema <dbId> --search <keyword>` |
| PG schema 找不到表 | `db-driver show <dbId>` 确认 schema 字段；可用 `--schema` 临时切换 |
| 无法解析 SQL | 含注释断字/条件注释，已被拒绝（设计如此） |
| 进程卡住 | MySQL/PG 连接池问题；`db-driver update` 拉到最新版试试 |

## AI Agent 协作红线

如果由 AI Agent 在调用本工具：

- **禁止自行提升权限** —— 权限被拒时不要自动跑 `db-driver config` 加新权限
- **提权必须用户明确同意** —— 只有用户亲口说"开 XX 权限"才能给新的 config 命令
- **失败立即停下并报告** —— 不要尝试第二条路径蒙混
- **不要直接编辑配置文件** —— 让用户自己用 `db-driver config`

完整版见 `skill/SKILL.md`（AI Agent 实际加载的入口）。

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

## 架构

```
db-driver/
├── src/
│   ├── cli.ts                 # commander 入口
│   ├── commands/              # 每个子命令一个文件
│   ├── db/
│   │   ├── mysql.ts           # MySQL 驱动 (mysql2)
│   │   ├── postgres.ts        # PostgreSQL 驱动 (pg)
│   │   ├── pool.ts            # 连接池（30s TTL）
│   │   └── permissions.ts     # AST 解析 + 权限校验
│   ├── store/configStore.ts   # JSON 配置读写
│   ├── utils/errors.ts        # 错误码中文翻译
│   └── web/                   # config --web 的本地网页
├── skill/SKILL.md             # AI Agent 看到的入口
└── AGENTS.md                  # 架构与规范
```

## 许可

MIT