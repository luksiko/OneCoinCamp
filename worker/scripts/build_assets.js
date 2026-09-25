import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(workerDir, '../docs');
const targetDir = resolve(workerDir, 'public');
mkdirSync(targetDir, { recursive: true });
mkdirSync(resolve(targetDir, 'app'), { recursive: true });
mkdirSync(resolve(docsDir, 'app'), { recursive: true });

// 1. Process index.html (Landing page)
const indexPath = resolve(docsDir, 'index.html');
if (existsSync(indexPath)) {
  const indexHtml = readFileSync(indexPath, 'utf8');
  writeFileSync(resolve(targetDir, 'index.html'), indexHtml);
}

// 2. Process app.html and app/index.html (Desktop & Mobile Mini App Dashboard)
const appPath = resolve(docsDir, 'app.html');
if (existsSync(appPath)) {
  const appHtml = readFileSync(appPath, 'utf8').replace(
    /var APPS_SCRIPT_URL\s*=\s*['"][^'"]*['"];/,
    'var APPS_SCRIPT_URL = window.location.origin;'
  );
  writeFileSync(resolve(targetDir, 'app.html'), appHtml);
  writeFileSync(resolve(targetDir, 'app/index.html'), appHtml);
  writeFileSync(resolve(docsDir, 'app/index.html'), appHtml);
}

// 3. Process favicon.png
const faviconPath = resolve(docsDir, 'favicon.png');
if (existsSync(faviconPath)) {
  copyFileSync(faviconPath, resolve(targetDir, 'favicon.png'));
  copyFileSync(faviconPath, resolve(targetDir, 'app/favicon.png'));
}
