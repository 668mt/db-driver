import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync, rmSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version?: string };
const APP_VERSION = pkg.version ?? '0.0.0';
const ASSETS_DIR = resolve(__dirname, 'dist/web/assets');

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  plugins: [
    react(),
    {
      name: 'inject-app-version',
      transformIndexHtml(html: string): string {
        return html.replace(/__APP_VERSION__/g, APP_VERSION);
      },
    },
    {
      // outDir 是 dist/web，和 tsc 的输出同目录，所以不能 emptyOutDir。
      // 但 assets/ 目录只归 vite 管 —— 每次构建前清掉，避免旧 hash 资源
      // 堆积进发布包（npm pack 会把它们一起打进去）。
      name: 'clean-assets',
      buildStart() {
        rmSync(ASSETS_DIR, { recursive: true, force: true });
      },
    },
  ],
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: false,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7842',
        changeOrigin: true,
      },
    },
  },
});