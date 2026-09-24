import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(resolve(dir, '../../../.env'));
loadEnvFile(resolve(dir, '../../.env'));
loadEnvFile(resolve(dir, '../.env'));

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const workerUrl = process.env.WORKER_PUBLIC_URL || 'https://camper-monitor.luksiko90.workers.dev';
const targetChatId = process.argv[2] || process.env.TELEGRAM_CHAT_ID;

if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN is required in .env or environment');
  process.exit(1);
}

async function setMenu(chatId) {
  const payload = {
    menu_button: {
      type: 'web_app',
      text: 'Open Monitor',
      web_app: { url: workerUrl },
    },
    ...(chatId ? { chat_id: String(chatId) } : {}),
  };

  const label = chatId ? `chat_id: ${chatId}` : 'global default';
  console.log(`Setting menu button (${label}) -> ${workerUrl}...`);
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  console.log(`Response (${label}):`, data);
}

async function main() {
  // Set for specified chat ID
  if (targetChatId) {
    await setMenu(targetChatId);
  }
  // Also set globally
  await setMenu();
}

main().catch((err) => {
  console.error('Failed to set menu button:', err);
  process.exit(1);
});
