import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(__dirname, '..', '..', 'package.json');

interface PackageJson {
  name: string;
  version: string;
}

export interface UpdateOptions {
  check: boolean;
  target?: string;
  json: boolean;
}

interface GlobalPackageInfo {
  dependencies?: Record<string, { resolved?: string }>;
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const pkg = readPkg();
  const pkgName = pkg.name;
  const currentVersion = pkg.version;

  if (isLinkedFromSource()) {
    throw new Error(
      '检测到 db-driver 是从本地源码链接安装的（开发模式）。\n' +
        '更新请用：\n' +
        '  cd <db-driver 源码目录> && git pull && npm run build\n' +
        '不要用 db-driver update，会覆盖你的开发目录。'
    );
  }

  const target = options.target ?? readLatestVersion(pkgName);

  if (target === currentVersion) {
    outputResult(options, { ok: true, current: currentVersion, target, upToDate: true });
    if (!options.json) {
      console.log(`✅ 已是最新版本 (${currentVersion})`);
    }
    return;
  }

  if (compareVersions(target, currentVersion) < 0) {
    outputResult(options, { ok: false, current: currentVersion, target, reason: 'downgrade-not-allowed' });
    if (!options.json) {
      console.log(`⚠️  目标版本 ${target} 低于当前 ${currentVersion}，跳过更新（要降级请手动：npm install -g ${pkgName}@${target}）`);
    }
    return;
  }

  if (options.check) {
    outputResult(options, { ok: true, current: currentVersion, target, upToDate: false, willUpdate: false });
    if (!options.json) {
      console.log(`📦 发现新版本: ${currentVersion} → ${target}`);
      console.log('（--check 模式，未执行更新）');
    }
    return;
  }

  outputResult(options, { ok: true, current: currentVersion, target, upToDate: false, willUpdate: true });
  if (!options.json) {
    console.log(`📦 发现新版本: ${currentVersion} → ${target}`);
    console.log(`⏳ 正在执行: npm install -g ${pkgName}@${target}`);
  }

  try {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(cmd, ['install', '-g', `${pkgName}@${target}`], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch (e) {
    throw new Error(`npm install 失败：${(e as Error).message}`);
  }

  if (!options.json) {
    console.log(`✅ 已更新到 ${target}`);
    console.log(`提示：重新打开终端或重新执行 db-driver 命令以加载新版本`);
  }
}

function readPkg(): PackageJson {
  return JSON.parse(readFileSync(PKG_PATH, 'utf8')) as PackageJson;
}

function npmCmd(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function npmRun(args: string[]): string {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
  } catch (e) {
    const msg = (e as { stdout?: string }).stdout ?? (e as Error).message;
    throw new Error(msg);
  }
}

function isLinkedFromSource(): boolean {
  // 关键判断：当前运行包的路径里是否包含 node_modules
  // - 全局安装：/usr/lib/node_modules/db-driver/package.json  ✓ 安全
  // - 本地安装：<project>/node_modules/db-driver/package.json  ✓ 安全
  // - 源码链接：D:/work/.../db-driver/package.json  ❌ 拒绝（用户应 git pull）
  const normalized = PKG_PATH.replace(/\\/g, '/');
  return !normalized.includes('/node_modules/');
}

function readLatestVersion(pkgName: string): string {
  try {
    return npmRun(['view', pkgName, 'version']);
  } catch (e) {
    throw new Error(
      `无法从 npm 获取 ${pkgName} 的最新版本：${(e as Error).message}\n` +
        `检查网络 / 镜像源配置（npm config get registry）`
    );
  }
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function parseVersion(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function outputResult(options: UpdateOptions, payload: Record<string, unknown>): void {
  if (!options.json) return;
  console.log(JSON.stringify(payload, null, 2));
}