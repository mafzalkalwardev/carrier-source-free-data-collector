/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function extensionStaticCopy() {
  return {
    name: 'extension-static-copy',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      mkdirSync(resolve(dist, 'icons'), { recursive: true });
      copyFileSync(resolve(__dirname, 'manifest.json'), resolve(dist, 'manifest.json'));
      if (existsSync(resolve(__dirname, 'public/icons'))) {
        cpSync(resolve(__dirname, 'public/icons'), resolve(dist, 'icons'), { recursive: true });
      }
      // Ensure popup/sidepanel html paths are relative for chrome-extension://
      for (const page of ['popup', 'sidepanel']) {
        const htmlPath = resolve(dist, `${page}.html`);
        if (existsSync(htmlPath)) {
          let html = readFileSync(htmlPath, 'utf-8');
          html = html
            .replaceAll('src="/assets/', 'src="./assets/')
            .replaceAll('href="/assets/', 'href="./assets/')
            .replaceAll('src=".assets/', 'src="./assets/')
            .replaceAll('href=".assets/', 'href="./assets/');
          writeFileSync(htmlPath, html);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), extensionStaticCopy()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        popup: resolve(__dirname, 'popup.html'),
        serviceWorker: resolve(__dirname, 'src/background/serviceWorker.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'serviceWorker') return 'background/serviceWorker.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
