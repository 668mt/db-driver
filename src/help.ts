import { SKILL_DEST } from './utils/paths.js';

/** CLI 帮助尾部示例块（addHelpText('after')） */
export function buildHelpExamples(): string {
  return `
连接管理:
  $ db-driver list                              # 列出所有 dbId
  $ db-driver list --json
  $ db-driver show <dbId>                       # 查看连接详情
  $ db-driver test <dbId>                       # 测试连接
  $ db-driver remove <dbId> --yes               # 删除连接
  $ db-driver disable <dbId>                    # 禁用连接（数据访问全部拒绝）
  $ db-driver enable <dbId>                     # 重新启用

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
  $ db-driver execute <dbId> "SELECT 1; SELECT 2"  # 多条语句（分号分隔），逐条做权限校验
  $ db-driver execute <dbId> "SELECT 1; SELECT 2" --continue-on-error  # 某条失败也继续

批量脚本:
  $ db-driver script <dbId> ./init.sql          # 执行 .sql 脚本文件（逐条做权限校验）
  $ db-driver script <dbId> ./init.sql --dry-run  # 只校验权限，不真正执行
  $ db-driver script <dbId> ./init.sql --json
  $ db-driver script <dbId> ./init.sql --continue-on-error

MCP:
  $ db-driver mcp                               # 以 stdio 方式启动 MCP server

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
`;
}
