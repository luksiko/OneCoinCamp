import { Env } from '../index';
import { DbClient } from '../db/client';

const CRYPTO_PAY_API_URL = 'https://pay.crypt.bot/api';

export class CryptoBotService {
  constructor(private env: Env, private db: DbClient) {}

  async createInvoice(telegramId: string, amount: number, currency: string = 'USDT') {
    if (!this.env.CRYPTO_BOT_TOKEN) throw new Error('Crypto bot token not set');
    
    const url = `${CRYPTO_PAY_API_URL}/createInvoice`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': this.env.CRYPTO_BOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asset: currency,
        amount: amount.toString(),
        description: 'Camper Monitor Premium (1 Month)',
        hidden_message: 'Thank you for your purchase!',
        payload: JSON.stringify({ telegram_id: telegramId })
      })
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CryptoPay API error: ${text}`);
    }
    
    const data = await res.json<any>();
    if (!data.ok) {
      throw new Error(`CryptoPay API error: ${JSON.stringify(data)}`);
    }
    
    return data.result; // contains pay_url, invoice_id, etc.
  }

  async verifyWebhookSignature(req: Request): Promise<boolean> {
    const signature = req.headers.get('crypto-pay-api-signature');
    if (!signature || !this.env.CRYPTO_BOT_TOKEN) return false;

    const body = await req.clone().text();
    
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.digest('SHA-256', encoder.encode(this.env.CRYPTO_BOT_TOKEN));
    
    const key = await crypto.subtle.importKey(
      'raw',
      secretKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = hexToBytes(signature);
    return await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(body));
  }
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
