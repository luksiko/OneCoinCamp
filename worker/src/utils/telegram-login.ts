export interface BrowserTelegramIdentity {
  id: string;
  username?: string;
  language?: string;
}

const encoder = new TextEncoder();
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function toBase64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function getSigningKey(botToken: string): Promise<CryptoKey> {
  const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));
  return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export function createBrowserLoginToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function browserLoginCode(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  const number = new DataView(digest).getUint32(0) % 1000000;
  return String(number).padStart(6, '0');
}

export async function createBrowserSession(identity: BrowserTelegramIdentity, botToken: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ ...identity, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  const signature = await crypto.subtle.sign('HMAC', await getSigningKey(botToken), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyBrowserSession(token: string, botToken: string): Promise<BrowserTelegramIdentity | null> {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !botToken) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(signature) || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
    const signatureBytes = fromBase64Url(signature);
    if (toBase64Url(signatureBytes) !== signature) return null;
    const valid = await crypto.subtle.verify('HMAC', await getSigningKey(botToken), signatureBytes, encoder.encode(payload));
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!session || typeof session.id !== 'string' || !/^\d+$/.test(session.id) || !Number.isSafeInteger(session.exp) || session.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: session.id, username: session.username, language: session.language };
  } catch {
    return null;
  }
}
