# db-driver

> 数据库查询 CLI 工具，支持 MySQL / PostgreSQL，带 Web 配置界面与权限管控。
>
> 包名 `db-driver`，CLI 命令 `db-driver`，本地路径 `~/.db-driver/`。

## 安装

```bash
npm install -g db-driver
```

或本地开发：

```bash
git clone <repo>
cd db-driver
npm install
npm run build
npm link
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `db-driver config` | 加 `--web` 打开网页；否则需传 `--dbId/--type/--host/...` 命令行保存 |
| `db-driver list` | 列出所有 dbId |
| `db-driver show <dbId>` | 查看连接详情（密码默认隐藏） |
| `db-driver test <dbId>` | 测试连接 |
| `db-driver remove <dbId> --yes` | 删除连接 |
| `db-driver schema <dbId>` | 默认只列表名；`--table <name>` 看字段 + 索引（含复合索引列顺序）；`--search` 过滤；`--json` 输出 |
| `db-driver sample <dbId> <table>` | 查看表里的样本数据（默认 10 行）；`--limit`、`--where`、`--json` |
| `db-driver count <dbId> <table>` | 行数统计；`--where` 条件；`--json` |
| `db-driver execute <dbId> "<SQL>"` | 执行单条 SQL；`--json`、`--limit N` 控制输出 |
| `db-driver explain <dbId> "<SQL>"` | 查看执行计划；`--analyze` 真正执行；`--json` 输出 |
| `db-driver install` | 安装 skill 到 `~/.agents/skills/db-driver` |
| `db-driver update [version]` | 从 npm 自更新；`--check` 仅检查；源码链接模式拒绝并提示用 git pull |

## 配置文件

- 数据库配置：`~/.db-driver/config.json`（明文 JSON，可直接编辑）

## 开发

```bash
npm install
npm run build         # 编译到 dist/
npm run dev           # watch 模式
npx db-driver --help  # 本地测试 CLI
```

> 命令名是 `db-driver`（不随包名变化），全局链接后直接 `db-driver --help`。

## 权限拦截说明

`execute` 子命令在执行 SQL 前会用 **node-sql-parser** 解析为 AST，再按语句类型检查权限位。**失败安全**：解析失败（注释断字、MySQL 条件注释、语法错误等）一律拒绝。

| 语句类型 | 需要权限 |
| --- | --- |
| `SELECT` / `SHOW` / `DESCRIBE` / `EXPLAIN` | `dmlQuery` |
| `INSERT` / `UPDATE` / `REPLACE` / `MERGE` | `dmlUpdate` |
| `DELETE` | `dmlDelete` |
| `CREATE` / `ALTER` / `DROP` / `TRUNCATE` / `RENAME` / `GRANT` / `REVOKE` | `ddl` |
| `CALL` / `LOAD DATA` / `PREPARE` / `EXECUTE` / `DO` / `SET` 等 | `ddl` |

## 错误信息本地化

常见 DB 错误自动翻译为中文友好提示：
- 1045 → "访问被拒绝：用户名或密码错误"
- 1049 / 3D000 → "数据库不存在"
- 1146 / 42P01 → "表不存在"
- 1064 / 42601 → "SQL 语法错误"
- 1213 / 40P01 → "死锁，请重试"
- ECONNREFUSED → "连接被拒绝：检查 host/port..."

配置侧 `test` / `execute` / `sample` / `count` 命令均会翻译错误。