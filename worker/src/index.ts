import { DbClient } from './db/client';
import { TelegramService } from './services/telegram';
import { runMonitorCycle } from './services/monitor';
import { handleRpcRequest } from './api/rpc';
import { setGasProxyUrl, fetchJson } from './utils/http';

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
    })());
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
    if (request.method === 'OPTIONS' && url.pathname === '/api/rpc') {
      if (!origin || !allowedOrigins.includes(origin)) return new Response('Forbidden', { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
          Vary: 'Origin',
        },
      });
    }

    const db = new DbClient(env.DB);
    const telegram = new TelegramService(
      {
        botToken: env.TELEGRAM_BOT_TOKEN_SECRET,
        chatId: env.TELEGRAM_CHAT_ID,
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
        workerUrl: env.WORKER_PUBLIC_URL || `${url.protocol}//${url.host}`,
      },
      db
    );

    const triggerMonitorFn = () => runMonitorCycle(db, telegram, env.ALERTS_ENABLED === 'true');

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
