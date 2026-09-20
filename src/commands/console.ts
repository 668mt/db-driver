import open from 'open';

import { startConfigServer } from '../web/server.js';
import { closeConfigDb } from '../store/configStore.js';

export async function runConsole(): Promise<void> {
  const handle = await startConfigServer();
  console.log(`\n🌐  db-driver console started`);
  console.log(`   URL: ${handle.url}`);
  console.log(`   在浏览器中管理连接配置和 SQL 用法笔记`);
  console.log(`   关闭浏览器窗口或按 Ctrl+C 退出\n`);

  let closed = false;
  const gracefulExit = (reason: string) => {
    if (closed) return;
    closed = true;
    console.log(`\n👋  ${reason}, 退出 db-driver console\n`);
    handle.shutdown().finally(() => {
      closeConfigDb();
      process.exit(0);
    });
  };

  handle.onLastClientGone(() => {
    setTimeout(() => {
      if (handle.port) gracefulExit('所有浏览器窗口已关闭');
    }, 500);
  });

  const forceExit = (reason: string) => {
    if (closed) return;
    closed = true;
    console.log(`\n👋  ${reason}, 退出 db-driver console\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => forceExit('收到 SIGINT 信号'));
  process.on('SIGTERM', () => forceExit('收到 SIGTERM 信号'));

  try {
    await open(handle.url, { wait: false });
  } catch {
    console.log('   (自动打开浏览器失败，请手动复制上面的 URL)');
  }

  await new Promise(() => {});
}