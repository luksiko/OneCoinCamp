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
const targetChatId = process.argv[2] || process.env.TELEGRAM_CHAT_ID;

if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN is required in .env or environment');
  process.exit(1);
}

const BOT_COMMANDS_RU = [
  { command: 'start', description: 'Главное меню' },
  { command: 'actual', description: 'Актуальные офферы за 1€' },
  { command: 'routes', description: 'Мои маршруты' },
  { command: 'check', description: 'Проверить сейчас' },
  { command: 'digest', description: 'Дайджест за 24 часа' },
  { command: 'subscribe', description: 'Премиум подписка' },
  { command: 'account', description: 'Мой аккаунт' },
  { command: 'silent', description: 'Тихие часы' },
  { command: 'status', description: 'Статус мониторинга' },
  { command: 'help', description: 'Справка и инструкции' },
];

const BOT_COMMANDS_EN = [
  { command: 'start', description: 'Main menu' },
  { command: 'actual', description: 'Active 1€ offers' },
  { command: 'routes', description: 'My tracked routes' },
  { command: 'check', description: 'Check offers now' },
  { command: 'digest', description: '24h digest' },
  { command: 'subscribe', description: 'Premium subscription' },
  { command: 'account', description: 'My account' },
  { command: 'silent', description: 'Silent hours' },
  { command: 'status', description: 'System status' },
  { command: 'help', description: 'Help & instructions' },
];

async function setCommands() {
  console.log('Registering bot commands (EN / default)...');
  const resEn = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: BOT_COMMANDS_EN }),
  });
  console.log('Response EN:', await resEn.json());

  console.log('Registering bot commands (RU)...');
  const resRu = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: BOT_COMMANDS_RU, language_code: 'ru' }),
  });
  console.log('Response RU:', await resRu.json());
}

async function setMenu(chatId) {
  const payload = {
    menu_button: { type: 'commands' },
    ...(chatId ? { chat_id: String(chatId) } : {}),
  };

  const label = chatId ? `chat_id: ${chatId}` : 'global default';
  console.log(`Setting menu button (${label}) -> commands menu (≡)...`);
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  console.log(`Response (${label}):`, data);
}

async function main() {
  await setCommands();

  // Set for specified chat ID if present
  if (targetChatId) {
    await setMenu(targetChatId);
  }
  // Also set globally
  await setMenu();
}

main().catch((err) => {
  console.error('Failed to set menu button and commands:', err);
  process.exit(1);
});
