import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: false,
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});