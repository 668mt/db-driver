#!/usr/bin/env node
/**
 * 一键清理 db-driver 开发残留进程 + 释放端口 7842 / 5173
 * 用法: node scripts/dev-stop.js
 */
import { execSync } from 'node:child_process';

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const TARGETS = [
  'node.exe',
  'tsx',
  'vite',
  'tsc',
  'wait-on',
  'concurrently',
];

console.log('[dev-stop] 扫描 db-driver 残留进程...');

for (const name of TARGETS) {
  const out = sh(`tasklist //FI "IMAGENAME eq ${name}.exe" //NH //FO CSV`);
  if (!out) continue;
  const pids = out.split('\n')
    .map(line => line.match(/"([^"]+)"/)?.[1])
    .filter(Boolean);
  if (pids.length === 0) continue;
  // 只杀命令行包含 db-driver 的
  for (const pid of pids) {
    const cmdline = sh(`wmic process where "ProcessId=${pid}" get CommandLine /VALUE`).toLowerCase();
    if (cmdline.includes('db-driver') || cmdline.includes('vite') || cmdline.includes('db-driver') || cmdline.includes('usage') || cmdline.includes('console')) {
      try {
        execSync(`taskkill //F //PID ${pid}`, { stdio: 'ignore' });
        console.log(`[dev-stop] 已杀 ${name} PID ${pid}`);
      } catch {}
    }
  }
}

// 兜底：强制杀任何占着 7842 / 5173 的进程
const ports = sh(`netstat -ano`).split('\n').filter(line => /:7842 |:5173 /.test(line) && /LISTENING/.test(line));
for (const line of ports) {
  const m = line.match(/\s(\d+)$/);
  if (!m) continue;
  const pid = m[1];
  try {
    execSync(`taskkill //F //PID ${pid}`, { stdio: 'ignore' });
    console.log(`[dev-stop] 已杀端口残留 PID ${pid}`);
  } catch {}
}

console.log('[dev-stop] 完成');