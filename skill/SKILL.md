---
name: db-driver
description: |
  通过 db-driver CLI 操作 MySQL / PostgreSQL 数据库：浏览 schema、查看样本、查询表数据，
  执行受限 SQL。当用户需要查看数据库结构、查询表内容、执行 SQL 时使用本 skill。
---

# db-driver Skill

`db-driver` 是 npm 包 `db-driver` 提供的 CLI 命令，为 AI Agent 提供**带权限管控**的数据库访问能力。所有 SQL 执行都受连接配置阶段预设的权限位限制。

> 包名 `db-driver`、CLI 命令 `db-driver`、本地路径 `~/.db-driver/` 三者同名是刻意的，调用最简洁。

## 安装

```bash
npm install -g db-driver
```

## 首次使用：配置数据库连接

两种方式，二选一。

**方式 A — 网页（交互式）**

```bash
db-driver config --web
```

- 会在浏览器中打开一个本地配置页面（127.0.0.1 上随机端口）。
- 配置项：`dbId`、类型（MySQL/PostgreSQL）、host、port、user、password、database。
- **权限开关**（必须明确告诉用户是否要开启）：
  - `dmlQuery`：SELECT 查询
  - `dmlUpdate`：INSERT / UPDATE
  - `dmlDelete`：DELETE
  - `ddl`：CREATE / ALTER / DROP / TRUNCATE 等
- 关闭浏览器窗口后 CLI 自动退出；连接信息保存到 `~/.db-driver/config.json`。

**方式 B — 命令行（适合脚本 / 自动化）**

```bash
db-driver config \
  --dbId my-app \
  --type mysql \
  --host 127.0.0.1 \
  --user root \
  --password secret \
  --database app \
  [--port 3306] \
  [--dml-query | --no-dml-query] \
  [--dml-update] [--dml-delete] [--ddl] \
  [--test]
```

- 必填：`--dbId --type --host --user --password --database`。
- 缺参数会报错并提示「用 --web 打开网页配置，或传齐以上参数命令行保存」。
- `--port` 不传则按类型自动填（mysql=3306、postgres=5432）。
- 默认权限：`dmlQuery=true`，其余 `false`（与网页默认值一致）。
- `--test` 会先尝试连接，失败则中止保存。
- 若 `dbId` 已存在会**直接覆盖**。

## 连接管理

```bash
db-driver list                       # 列出所有连接
db-driver list --json                # JSON 输出
db-driver show <dbId>                # 查看连接详情（密码默认隐藏）
db-driver show <dbId> --reveal-password
db-driver test <dbId>                # 测试连接
db-driver remove <dbId> --yes        # 删除连接
```

## 数据浏览

```bash
# Schema（默认轻量；只看表名）
db-driver schema <dbId>

# 单表结构（按需查看，避免上下文爆炸）
db-driver schema <dbId> --table <name>          # 字段 + 索引（含复合索引列顺序）

# 表名过滤
db-driver schema <dbId> --search user

# 分页 + JSON
db-driver schema <dbId> --limit 200 --offset 0 --json

# 样本数据（默认 10 行）
db-driver sample <dbId> <table>
db-driver sample <dbId> <table> --limit 5
db-driver sample <dbId> <table> --where "id > 100"
db-driver sample <dbId> <table> --json

# 行数统计
db-driver count <dbId> <table>
db-driver count <dbId> <table> --where "status = 'ACTIVE'"

# 查询计划
db-driver explain <dbId> "SELECT ..."
db-driver explain <dbId> "SELECT ..." --json
db-driver explain <dbId> "SELECT ..." --analyze   # ⚠️ 真正执行，UPDATE/DELETE 会修改数据
```

## 执行 SQL

```bash
# 默认表格输出，SELECT 最多显示 50 行
db-driver execute <dbId> "SELECT * FROM users LIMIT 10"

# 调整显示行数 / JSON 输出
db-driver execute <dbId> "SELECT ..." --limit 200
db-driver execute <dbId> "SELECT ..." --json

# 写操作需要相应权限
db-driver execute <dbId> "UPDATE users SET ..."   # 需要 dmlUpdate
db-driver execute <dbId> "DELETE FROM ..."         # 需要 dmlDelete
db-driver execute <dbId> "ALTER TABLE ..."         # 需要 ddl
```

**限制：**

1. **单条语句**——不支持以分语句（分号分隔的多条 SQL）。
2. **权限校验**——执行前按连接的权限位拦截，无权限则拒绝。
3. **失败安全**——SQL 解析失败（注释断字、MySQL 条件注释等绕过技巧）一律拒绝。

## explain（查询计划）

- 默认仅返回计划（不执行查询）。
- `--analyze` 会**真正执行**：
  - SELECT → 需要 `dmlQuery`
  - UPDATE/DELETE/INSERT → 需要对应的写权限
- `--json` 返回 DB 自带的 JSON 格式（MySQL `FORMAT=JSON`，Postgres `(FORMAT JSON)`）。

## 自更新

```bash
db-driver update              # 升到 npm 最新版
db-driver update --check      # 仅检查不更新
db-driver update 0.2.0        # 升到指定版本
db-driver update --json       # JSON 输出（AI Agent 用）
```

**安全机制：**
- 源码链接（`npm link` / `git clone`）下运行会自动拒绝，提示用 `git pull && npm run build`
- 不允许降级（要降级手动 `npm install -g db-driver@<ver>`）
- 网络/registry 不可达会报中文错误

## 典型工作流（AI Agent）

1. 用户：「帮我看看未支付订单有多少」
   - `db-driver list` 找到 dbId（如果不知道）
   - `db-driver count <dbId> orders --where "status='UNPAID'"`
   - 或者更细致：`db-driver sample <dbId> orders --where "status='UNPAID'" --limit 5`
2. 用户：「修改 users 表的 email 字段」
   - `db-driver schema <dbId> --table users` 确认当前结构
   - 检查连接是否开启 `ddl`，否则 `db-driver config ... --ddl`
   - `db-driver execute <dbId> "ALTER TABLE users ..."`
3. 用户：「列出所有表名」
   - `db-driver schema <dbId>`（轻量输出）

## 故障排查路径

```
连接不存在        → db-driver list 看 dbId；或 db-driver config 添加
权限被拒         → db-driver show <dbId> 看权限位；db-driver config 调整
表不存在         → db-driver schema <dbId> --search <keyword> 找相似表
列不存在         → db-driver schema <dbId> --table <table> 看真实列名
无法解析 SQL     → 含绕过技巧，已被 SQL 解析器拒绝
```

## 配置 / 数据位置

- 连接配置：`~/.db-driver/config.json`（明文 JSON，可手动编辑）
- Skill 安装位置：`~/.agents/skills/db-driver/`
