import open from 'open';

import { startConfigServer, type ServerHandle } from '../web/server.js';
import { closeConfigDb } from '../store/configStore.js';

export const DEFAULT_CONSOLE_PORT = 7842;

export interface ConsoleOptions {
  port?: number;
  open?: boolean;
}

async function isPortAvailable(port: number): Promise<boolean> {
  const net = await import('net');
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.listen(port, '127.0.0.1', () => tester.close(() => resolve(true)));
  });
}

async function tryStart(requestedPort: number): Promise<{ handle: ServerHandle; fallback: boolean }> {
  if (await isPortAvailable(requestedPort)) {
    const handle = await startConfigServer(requestedPort);
    return { handle, fallback: false };
  }
  console.log(`⚠️  端口 ${requestedPort} 被占用，改用随机端口`);
  const handle = await startConfigServer(0);
  return { handle, fallback: true };
}

export async function runConsole(options: ConsoleOptions = {}): Promise<void> {
  const requestedPort = options.port ?? DEFAULT_CONSOLE_PORT;
  const { handle, fallback } = await tryStart(requestedPort);
  console.log(`\n🌐  db-driver console started`);
  console.log(`   URL: ${handle.url}`);
  if (fallback) {
    console.log(`   (请求的端口 ${requestedPort} 被占用，已自动改为 ${handle.port})`);
  }
  console.log(`   在浏览器中管理连接配置和 SQL 用法笔记`);
  console.log(`   关闭浏览器窗口不会退出 CLI；要退出请按 Ctrl+C`);
  if (!options.open) {
    console.log(`   (默认不自动打开浏览器；加 --open 启用，或手动复制上面 URL)\n`);
  } else {
    console.log();
  }

  const forceExit = (reason: string) => {
    console.log(`\n👋  ${reason}, 退出 db-driver console\n`);
    handle.shutdown().finally(() => {
      closeConfigDb();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => forceExit('收到 SIGINT 信号'));
  process.on('SIGTERM', () => forceExit('收到 SIGTERM 信号'));

  if (options.open) {
    try {
      await open(handle.url, { wait: false });
    } catch {
      console.log('   (自动打开浏览器失败，请手动复制上面的 URL)');
    }
  }

  await new Promise(() => {});
}