import { CryptoBotService } from "./services/cryptobot";

import { DbClient } from './db/client';
import { TelegramService } from './services/telegram';
import { runMonitorCycle } from './services/monitor';
import { dispatchAlertOutbox } from './services/telegram-outbox';
import { handleRpcRequest } from './api/rpc';
import { setGasProxyUrl, fetchJson } from './utils/http';
import { browserLoginCode, createBrowserLoginToken, createBrowserSession } from './utils/telegram-login';
import { expireSubscriptions } from './services/subscription';
import { handlePaddleWebhook } from './services/paddle-webhook';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TELEGRAM_BOT_TOKEN_SECRET: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ALERTS_ENABLED?: string;
  WEBHOOK_CUTOVER?: string;
  WORKER_PUBLIC_URL?: string;
  GAS_PROXY_URL?: string;
  ALERT_QUEUE: Queue<{ kind: 'dispatch-alerts' }>;
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  PADDLE_CLIENT_TOKEN?: string;
  PADDLE_PRICE_ID?: string;
  PADDLE_ENVIRONMENT?: string;
  CRYPTO_BOT_TOKEN?: string;
}

export default {
  // 1. Cron Trigger (Every 10 minutes)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (env.GAS_PROXY_URL) {
      setGasProxyUrl(env.GAS_PROXY_URL);
    }
    const db = new DbClient(env.DB);
    const telegram = new TelegramService(
      {
        botToken: env.TELEGRAM_BOT_TOKEN_SECRET,
        chatId: env.TELEGRAM_CHAT_ID,
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
        workerUrl: env.WORKER_PUBLIC_URL,
      },
      db
    );

    ctx.waitUntil((async () => {
      if (env.WEBHOOK_CUTOVER === 'true' && env.WORKER_PUBLIC_URL) {
        try {
          const settings = await db.getSettings();
          if (settings.webhook_cutover_complete !== true) {
            await telegram.registerWebhook(`${env.WORKER_PUBLIC_URL}/webhook/telegram`);
            await telegram.setChatMenuButton(undefined, env.WORKER_PUBLIC_URL);
            if (env.TELEGRAM_CHAT_ID) {
              await telegram.setChatMenuButton(env.TELEGRAM_CHAT_ID, env.WORKER_PUBLIC_URL);
            }
            await db.setSetting('webhook_cutover_complete', true);
            console.log('Telegram webhook and menu button moved to Cloudflare Worker.');
          }
        } catch (error) {
          console.error('Telegram webhook cutover failed:', error);
        }
      }
      await runMonitorCycle(db, telegram, env.ALERTS_ENABLED === 'true');
      await expireSubscriptions(db, telegram);
      if (env.ALERTS_ENABLED === 'true') await env.ALERT_QUEUE.send({ kind: 'dispatch-alerts' });
    })());
  },

  async queue(batch: MessageBatch<{ kind: 'dispatch-alerts' }>, env: Env): Promise<void> {
    const db = new DbClient(env.DB);
    const telegram = new TelegramService({
      botToken: env.TELEGRAM_BOT_TOKEN_SECRET,
      chatId: env.TELEGRAM_CHAT_ID,
      webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
      workerUrl: env.WORKER_PUBLIC_URL,
    }, db);
    const result = await dispatchAlertOutbox(db, telegram, { maxMessages: 35 });
    await db.addSentAlertsToLatestRun(result.sent);
    if (result.rateLimited) {
      await env.ALERT_QUEUE.send({ kind: 'dispatch-alerts' }, { delaySeconds: Math.max(30, Math.min(300, result.retryAfterSeconds || 60)) });
    } else if (result.sent + result.failed + result.retried >= 35) {
      await env.ALERT_QUEUE.send({ kind: 'dispatch-alerts' });
    }
  },

  // 2. HTTP Request Handler (Telegram Webhook & Mini App RPC)
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (env.GAS_PROXY_URL) {
      setGasProxyUrl(env.GAS_PROXY_URL);
    }
    const url = new URL(request.url);
    const legacyUiOrigin = 'https://luksiko.github.io';
    const origin = request.headers.get('Origin');
    const allowedOrigins = [legacyUiOrigin, env.WORKER_PUBLIC_URL, `${url.protocol}//${url.host}`].filter(Boolean);
    const authPaths = ['/api/rpc', '/api/auth/telegram/start', '/api/auth/telegram/status'];
    if (request.method === 'OPTIONS' && authPaths.includes(url.pathname)) {
      if (!origin || !allowedOrigins.includes(origin)) return new Response('Forbidden', { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
          Vary: 'Origin',
        },
      });
    }

    const db = new DbClient(env.DB);
    if (url.pathname === '/api/auth/telegram/start' && request.method === 'POST') {
      if (origin && !allowedOrigins.includes(origin)) return jsonResponse({ error: 'Forbidden' }, 403);
      try {
        const bot = await fetchJson<any>(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN_SECRET}/getMe`, { retries: 0 });
        if (!bot?.ok || !bot.result?.username) throw new Error('Telegram bot is not configured');
        const token = createBrowserLoginToken();
        await db.createBrowserLoginChallenge(token);
        return withCors(jsonResponse({ token, code: await browserLoginCode(token), loginUrl: `https://t.me/${bot.result.username}?start=login_${token}` }), origin, allowedOrigins);
      } catch {
        return withCors(jsonResponse({ error: 'Telegram login is unavailable' }, 503), origin, allowedOrigins);
      }
    }

    if (url.pathname === '/api/auth/telegram/status' && request.method === 'POST') {
      if (origin && !allowedOrigins.includes(origin)) return jsonResponse({ error: 'Forbidden' }, 403);
      try {
        const payload = await request.json<any>();
        if (!payload || typeof payload.token !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(payload.token)) {
          return withCors(jsonResponse({ error: 'Invalid login request' }, 400), origin, allowedOrigins);
        }
        const attempt = await db.consumeBrowserLoginChallenge(payload.token);
        if (attempt.status !== 'approved' || !attempt.identity) {
          return withCors(jsonResponse({ status: attempt.status }), origin, allowedOrigins);
        }
        const session = await createBrowserSession(attempt.identity, env.TELEGRAM_BOT_TOKEN_SECRET);
        return withCors(jsonResponse({ status: 'approved', token: session }), origin, allowedOrigins);
      } catch {
        return withCors(jsonResponse({ error: 'Invalid Telegram login request' }, 400), origin, allowedOrigins);
      }
    }

    const telegram = new TelegramService(
      {
        botToken: env.TELEGRAM_BOT_TOKEN_SECRET,
        chatId: env.TELEGRAM_CHAT_ID,
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
        workerUrl: env.WORKER_PUBLIC_URL || `${url.protocol}//${url.host}`,
        cryptoBotToken: env.CRYPTO_BOT_TOKEN,
      },
      db
    );

    const triggerMonitorFn = async () => {
      const result = await runMonitorCycle(db, telegram, env.ALERTS_ENABLED === 'true');
      if (env.ALERTS_ENABLED === 'true') await env.ALERT_QUEUE.send({ kind: 'dispatch-alerts' });
      return result;
    };

    // Paddle Payment Webhook
    if (url.pathname === '/webhook/paddle' && request.method === 'POST') {
      if (!env.PADDLE_WEBHOOK_SECRET) {
        return new Response('Paddle not configured', { status: 503 });
      }
      return handlePaddleWebhook(request, db, telegram, env.PADDLE_WEBHOOK_SECRET);
    }
    
    if (url.pathname === '/webhook/cryptobot' && request.method === 'POST') {
      const cryptoService = new CryptoBotService(env, db);
      const isValid = await cryptoService.verifyWebhookSignature(request);
      if (!isValid) return new Response('Invalid signature', { status: 401 });

      try {
        const body = await request.json<any>();
        if (body.update_type === 'invoice_paid') {
          const payload = typeof body.payload.payload === 'string' 
            ? JSON.parse(body.payload.payload) 
            : body.payload.payload;
          const telegramId = payload.telegram_id;
          if (telegramId) {
            await db.activateSubscription(telegramId, 30);
            await db.recordPayment({
              telegram_id: telegramId,
              paddle_transaction_id: `crypto_${body.payload.invoice_id}`,
              amount: parseFloat(body.payload.amount),
              currency: body.payload.asset,
              status: 'completed',
              subscription_days: 30
            });
            await telegram.sendMessage(telegramId, '🎉 <b>Payment received!</b> Your Premium subscription is now active for 30 days.\n\nEnjoy unlimited routes and analytics!');
          }
        }
        return new Response('OK');
      } catch (e) {
        return new Response('Error processing webhook', { status: 500 });
      }
    }

    // Telegram Bot Webhook
    if (url.pathname === '/webhook/telegram' || url.pathname === '/webhook') {
      if (request.method === 'POST') {
        return telegram.handleWebhook(request, triggerMonitorFn);
      }
      return new Response('Webhook endpoint active. Send POST updates.', { status: 200 });
    }

    if (url.pathname === '/webhook/register') {
      try {
        const targetWorkerUrl = env.WORKER_PUBLIC_URL || `${url.protocol}//${url.host}`;
        await telegram.registerWebhook(`${targetWorkerUrl}/webhook/telegram`);
        await telegram.setChatMenuButton(undefined, targetWorkerUrl);
        if (env.TELEGRAM_CHAT_ID) {
          await telegram.setChatMenuButton(env.TELEGRAM_CHAT_ID, targetWorkerUrl);
        }
        return new Response(JSON.stringify({ ok: true, message: 'Webhook registered successfully with secret token' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message || String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Mini App API / RPC endpoint
    if (url.pathname === '/api/rpc' || url.searchParams.get('api') === '1') {
      const response = await handleRpcRequest(request, {
        db,
        telegram,
        botToken: env.TELEGRAM_BOT_TOKEN_SECRET,
        chatId: env.TELEGRAM_CHAT_ID,
        workerUrl: `${url.protocol}//${url.host}`,
        triggerMonitorFn,
        paddleClientToken: env.PADDLE_CLIENT_TOKEN,
        paddlePriceId: env.PADDLE_PRICE_ID,
      });
      if (origin && allowedOrigins.includes(origin)) {
        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Vary', 'Origin');
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    }

    // Manual run trigger
    if (url.pathname === '/run') {
      ctx.waitUntil(triggerMonitorFn());
      return new Response(JSON.stringify({ ok: true, message: 'Monitor cycle triggered via background worker' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'camper-monitor',
          platform: 'cloudflare-workers',
          database: 'cloudflare-d1',
          timestamp: new Date().toISOString(),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (request.method === 'GET' || request.method === 'HEAD') return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function withCors(response: Response, origin: string | null, allowedOrigins: Array<string | undefined>): Response {
  if (!origin || !allowedOrigins.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}
