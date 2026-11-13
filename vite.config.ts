import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const API = process.env.WC_API ?? 'http://127.0.0.1:8000';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'web/index.html'),
        ...(existsSync(resolve(__dirname, 'web/play.html')) ? { play: resolve(__dirname, 'web/play.html') } : {}),
      },
    },
  },
  test: { include: ['web/src/**/*.test.ts'], environment: 'node' },
} as any);
