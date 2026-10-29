import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

mkdirSync(resolve(dist, 'content'), { recursive: true });
mkdirSync(resolve(dist, 'icons'), { recursive: true });

// Vite lib mode may emit content/contentScript.iife.js
const candidates = [
  resolve(dist, 'content/contentScript.js'),
  resolve(dist, 'content/contentScript.iife.js'),
  resolve(dist, 'contentScript.js'),
  resolve(dist, 'contentScript.iife.js'),
];

const found = candidates.find((p) => existsSync(p));
if (!found) {
  console.error('Content script bundle not found. Looked for:', candidates);
  process.exit(1);
}

const target = resolve(dist, 'content/contentScript.js');
if (found !== target) {
  copyFileSync(found, target);
  console.log(`Normalized content script: ${found} -> ${target}`);
}

copyFileSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));

for (const size of [16, 48, 128]) {
  const src = resolve(root, `public/icons/icon${size}.png`);
  if (existsSync(src)) {
    copyFileSync(src, resolve(dist, `icons/icon${size}.png`));
  }
}

for (const page of ['popup', 'sidepanel']) {
  const htmlPath = resolve(dist, `${page}.html`);
  if (!existsSync(htmlPath)) continue;
  let html = readFileSync(htmlPath, 'utf-8');
  html = html
    .replaceAll('src="/assets/', 'src="./assets/')
    .replaceAll('href="/assets/', 'href="./assets/')
    .replaceAll('src=".assets/', 'src="./assets/')
    .replaceAll('href=".assets/', 'href="./assets/');
  writeFileSync(htmlPath, html);
}

console.log('dist finalized');
