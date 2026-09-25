import { DbClient } from '../db/client';
import { TelegramService } from './telegram';

const SUBSCRIPTION_DAYS = 30;
const encoder = new TextEncoder();

export async function handlePaddleWebhook(
  request: Request,
  db: DbClient,
  telegram: TelegramService,
  webhookSecret: string
): Promise<Response> {
  // 1. Get raw body BEFORE parsing
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('Paddle-Signature') || '';

  // 2. Verify HMAC-SHA256 signature
  if (!await verifyPaddleSignature(rawBody, signatureHeader, webhookSecret)) {
    return new Response('Invalid signature', { status: 403 });
  }

  // 3. Parse and process
  const event = JSON.parse(rawBody);
  const eventType = event.event_type;

  try {
    switch (eventType) {
      case 'transaction.completed':
        await handleTransactionCompleted(event, db, telegram);
        break;
      case 'subscription.activated':
        await handleSubscriptionActivated(event, db);
        break;
      case 'subscription.canceled':
      case 'subscription.past_due':
        await handleSubscriptionCanceled(event, db, telegram);
        break;
    }
  } catch (err: any) {
    console.error(`Paddle webhook error (${eventType}):`, err.message);
  }

  return new Response('OK', { status: 200 });
}

async function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(';');
  const tsEntry = parts.find(p => p.startsWith('ts='));
  const h1Entry = parts.find(p => p.startsWith('h1='));
  if (!tsEntry || !h1Entry) return false;

  const ts = tsEntry.split('=')[1];
  const h1 = h1Entry.split('=')[1];
  const signedPayload = `${ts}:${rawBody}`;

  // Replay protection: reject if older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const computed = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expected = hexToBytes(h1);

  return crypto.subtle.timingSafeEqual(computed, expected.buffer as ArrayBuffer);
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/.{2}/g) || [], b => parseInt(b, 16));
}

async function handleTransactionCompleted(event: any, db: DbClient, telegram: TelegramService) {
  const data = event.data;
  const customData = data.custom_data || {};
  const telegramId = customData.telegram_id;
  if (!telegramId) {
    console.warn('Paddle transaction without telegram_id in custom_data');
    return;
  }

  // Idempotency: check if already processed
  const existingPayments = await db.getUserPayments(telegramId);
  if (existingPayments.some(p => p.paddle_transaction_id === data.id)) return;

  // Record payment
  const amount = data.details?.totals?.total
    ? Number(data.details.totals.total) : 499;
  const currency = data.currency_code || 'EUR';

  await db.recordPayment({
    telegram_id: telegramId,
    paddle_transaction_id: data.id,
    amount,
    currency,
    status: 'completed',
    subscription_days: SUBSCRIPTION_DAYS,
  });

  // Activate/extend subscription
  await db.activateSubscription(telegramId, SUBSCRIPTION_DAYS);

  // Store Paddle customer/subscription IDs
  if (data.customer_id) {
    await db.setPaddleIds(
      telegramId,
      data.customer_id,
      data.subscription_id || undefined
    );
  }

  // Notify user in Telegram
  const user = await db.getUser(telegramId);
  if (user) {
    await telegram.sendMessage(user.chat_id,
      '✅ <b>Payment received!</b>\n\n' +
      `Your Premium subscription is now active for ${SUBSCRIPTION_DAYS} days.\n` +
      '🎉 Unlimited routes and monitoring alerts are unlocked!\n\n' +
      'Use /account to check your subscription status.'
    );
  }
}

async function handleSubscriptionActivated(event: any, db: DbClient) {
  const data = event.data;
  const customData = data.custom_data || {};
  const telegramId = customData.telegram_id;
  if (!telegramId) return;

  if (data.customer_id) {
    await db.setPaddleIds(telegramId, data.customer_id, data.id);
  }
}

async function handleSubscriptionCanceled(event: any, db: DbClient, telegram: TelegramService) {
  const data = event.data;
  const customData = data.custom_data || {};
  const telegramId = customData.telegram_id;
  if (!telegramId) return;

  const user = await db.getUser(telegramId);
  if (user && user.role !== 'admin') {
    await db.setSubscription(
      telegramId, 'expired',
      user.subscription_started_at || '',
      user.subscription_expires_at || ''
    );
    await db.setUserRole(telegramId, 'free');
    await telegram.sendMessage(user.chat_id,
      '⏰ <b>Your subscription has been canceled.</b>\n\n' +
      'Monitoring alerts are paused. Your history is preserved.\n' +
      'Use /subscribe to renew anytime.'
    );
  }
}
