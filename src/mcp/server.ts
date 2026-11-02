import { readFileSync } from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  errorResult,
  textResult,
  toolCount,
  toolExecute,
  toolExplain,
  toolListConnections,
  toolSample,
  toolSetConnectionEnabled,
  toolSchema,
} from './tools.js';
import { toolScript } from './scriptTool.js';

const PERMISSION_NOTE =
  '所有 SQL 都会先经过 AST 权限校验（dmlQuery / dmlUpdate / dmlDelete / ddl），' +
  '权限不足会被拒绝；AI 不要自行提升权限。';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'db-driver',
      version: readVersion(),
    },
    {
      capabilities: { tools: {} },
      instructions:
        `db-driver：带权限管控的 MySQL / PostgreSQL 访问工具。${PERMISSION_NOTE}\n` +
        'execute 支持多条语句（分号分隔），每条单独校验权限。',
    }
  );

  server.registerTool(
    'db_list_connections',
    {
      title: '列出数据库连接',
      description: '列出所有已配置的数据库连接（dbId / 类型 / 库名 / 权限位），不含密码。',
      inputSchema: {},
    },
    async () => {
      try {
        return await toolListConnections();
      } catch (e) {
        return errorResult(`读取连接列表失败: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    'db_set_connection_enabled',
    {
      title: '启用 / 禁用连接',
      description:
        '启用或禁用一个数据库连接。禁用后该连接的任何数据访问（schema / sample / execute / script）都会被拒绝，' +
        '但账号密码与权限位都保留，随时可以再启用。',
      inputSchema: {
        dbId: z.string().describe('数据库连接别名'),
        enabled: z.boolean().describe('true = 启用，false = 禁用'),
      },
    },
    async (args) => {
      try {
        return await toolSetConnectionEnabled(args);
      } catch (e) {
        return errorResult(`操作失败: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    'db_schema',
    {
      title: '查看数据库结构',
      description:
        '列出表名（轻量）或查看指定表的字段 / 索引详情。MySQL/PostgreSQL 通用。',
      inputSchema: {
        dbId: z.string().describe('数据库连接别名'),
        table: z.string().optional().describe('表名；不传则只列表名'),
        search: z.string().optional().describe('按表名模糊过滤'),
        schema: z.string().optional().describe('PostgreSQL 临时切换 schema'),
        limit: z.number().int().min(1).max(500).optional().describe('最多返回多少张表（默认 100）'),
        offset: z.number().int().min(0).optional().describe('起始偏移'),
      },
    },
    async (args) => {
      try {
        return await toolSchema(args);
      } catch (e) {
        return errorResult(`查询 schema 失败: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    'db_sample',
    {
      title: '查看样本数据',
      description: '查看表里的样本数据（默认 10 行），可加 WHERE 条件。',
      inputSchema: {
        dbId: z.string().describe('数据库连接别名'),
        table: z.string().describe('表名'),
        limit: z.number().int().min(1).max(200).optional().describe('返回行数（默认 10）'),
        where: z.string().optional().describe('附加 WHERE 条件（不含 WHERE 关键字）'),
      },
    },
    async (args) => {
      try {
        return await toolSample(args);
      } catch (e) {
        return errorResult(`采样失败: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    'db_count',
    {
      title: '统计表行数',
      description: '统计表的行数，可加 WHERE 条件。',
      inputSchema: {
        dbId: z.string().describe('数据库连接别名'),
        table: z.string().describe('表名'),
        where: z.string().optional().describe('附加 WHERE 条件（不含 WHERE 关键字）'),
      },
    },
    async (args) => {
      try {
        return await toolCount(args);
      } catch (e) {
        return errorResult(`统计失败: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    'db_execute',
    {
      title: '执行 SQL',
      description:
        '在指定数据库上执行 SQL。支持多条语句（分号分隔），会按顺序逐条执行，' +
        '每条单独做权限校验。默认遇错即停。',
      inputSchema: {
        dbId: z.string().describe('数据库连接别名'),
        sql: z.string().describe('要执行的 SQL；多条语句用分号分隔'),
        limit: z.number().int().min(1).max(500).optional().describe('每条 SELECT 最多返回多少行（默认 50）'),
        dryRun: z.boolean().optional().describe('只校验权限不执行（默认 false）'),
        continueOnError: z
          .boolean()
          .optional()
          .describe('某条失败后是否继续执行后面的语句（默认 false）'),
      },
    },
    async (args) => {
      try {
        return await toolExecute(args);
      } catch (e) {
        return errorResult(`执行失败: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    'db_script',
    {
      title: '批量执行 SQL 脚本文件',
      description:
        '执行 .sql 脚本文件：按顶层分号拆成多条语句，逐条做权限校验后顺序执行。' +
        '支持 dryRun 预检权限。',
      inputSchema: {
        dbId: z.string().describe('数据库连接别名'),
        file: z.string().describe('SQL 脚本文件路径'),
        dryRun: z.boolean().optional().describe('只校验权限不执行（默认 false）'),
        continueOnError: z.boolean().optional().describe('某条失败后是否继续（默认 false）'),
        limit: z.number().int().min(1).max(500).optional().describe('每条 SELECT 最多返回多少行'),
      },
    },
    async (args) => {
      try {
        return await toolScript(args);
      } catch (e) {
        return errorResult(`脚本执行失败: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    'db_explain',
    {
      title: '查看执行计划',
      description: '查看 SQL 的执行计划。默认只出计划；analyze=true 会真正执行。',
      inputSchema: {
        dbId: z.string().describe('数据库连接别名'),
        sql: z.string().describe('要分析的 SQL'),
        analyze: z.boolean().optional().describe('真正执行并返回实际耗时（默认 false）'),
      },
    },
    async (args) => {
      try {
        return await toolExplain(args);
      } catch (e) {
        return errorResult(`EXPLAIN 失败: ${(e as Error).message}`);
      }
    }
  );

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 阻塞到客户端断开（stdin 关闭），否则 CLI 会立刻退出
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
    process.stdin.on('end', () => resolve());
    process.stdin.on('close', () => resolve());
  });
}

function readVersion(): string {
  try {
    const url = new URL('../../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(url, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export { textResult, errorResult };
