import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version?: string };
const APP_VERSION = pkg.version ?? '0.0.0';

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