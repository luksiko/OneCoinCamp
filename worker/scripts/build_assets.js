import { mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(workerDir, '../docs');
const frontendDir = resolve(workerDir, '../frontend');
const targetDir = resolve(workerDir, 'public');

mkdirSync(targetDir, { recursive: true });

// 1. Build frontend if it exists
if (existsSync(resolve(frontendDir, 'package.json'))) {
  console.log('Building Vue 3 frontend...');
  if (!existsSync(resolve(frontendDir, 'node_modules'))) {
    console.log('node_modules not found, running npm install...');
    execSync('npm install', { cwd: frontendDir, stdio: 'inherit' });
  }
  execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
}

// 2. Process index.html (Landing page)
const indexPath = resolve(docsDir, 'index.html');
if (existsSync(indexPath)) {
  const indexHtml = readFileSync(indexPath, 'utf8');
  writeFileSync(resolve(targetDir, 'index.html'), indexHtml);
}

// 3. Process Vue 3 app in docs/app -> targetDir/app
const docsAppDir = resolve(docsDir, 'app');
if (existsSync(docsAppDir)) {
  rmSync(resolve(targetDir, 'app'), { recursive: true, force: true });
  cpSync(docsAppDir, resolve(targetDir, 'app'), { recursive: true });
}

// 4. Process legacy app.html fallback
const legacyAppPath = resolve(docsDir, 'app.html');
if (existsSync(legacyAppPath)) {
  const legacyAppHtml = readFileSync(legacyAppPath, 'utf8').replace(
    /var APPS_SCRIPT_URL\s*=\s*['"][^'"]*['"];/,
    'var APPS_SCRIPT_URL = window.location.origin;'
  );
  writeFileSync(resolve(targetDir, 'app.html'), legacyAppHtml);
}

// 5. Process favicon.png
const faviconPath = resolve(docsDir, 'favicon.png');
if (existsSync(faviconPath)) {
  copyFileSync(faviconPath, resolve(targetDir, 'favicon.png'));
  copyFileSync(faviconPath, resolve(targetDir, 'app/favicon.png'));
}

console.log('Assets build completed successfully.');
