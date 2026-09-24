import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(workerDir, '../docs/index.html');
const targetDir = resolve(workerDir, 'public');
const html = readFileSync(source, 'utf8').replace(
  "var APPS_SCRIPT_URL = 'https://camper-monitor.luksiko90.workers.dev';",
  'var APPS_SCRIPT_URL = window.location.origin;'
);
mkdirSync(targetDir, { recursive: true });
writeFileSync(resolve(targetDir, 'index.html'), html);
