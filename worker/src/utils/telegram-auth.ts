export interface TelegramIdentity {
  id: string;
  language?: string;
  username?: string;
  chatId?: string;
}

const encoder = new TextEncoder();

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/.{2}/g) || [], (part) => Number.parseInt(part, 16));
}

export async function verifyTelegramInitData(initData: string, botToken: string): Promise<TelegramIdentity | null> {
  if (!initData || initData.length > 8192 || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash) || !Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > 86400) {
    return null;
  }
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) return null;

  const checkString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = await crypto.subtle.importKey('raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
  const verificationKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('HMAC', verificationKey, fromHex(hash), encoder.encode(checkString)))) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
    const chat = JSON.parse(params.get('chat') || 'null');
    return {
      id: String(user.id),
      language: typeof user.language_code === 'string' ? user.language_code : undefined,
      username: typeof user.username === 'string' ? user.username : undefined,
      chatId: chat && Number.isSafeInteger(chat.id) ? String(chat.id) : undefined,
    };
  } catch {
    return null;
  }
}
