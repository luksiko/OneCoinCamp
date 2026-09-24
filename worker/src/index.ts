import { DbClient } from './db/client';
import { TelegramService } from './services/telegram';
import { runMonitorCycle } from './services/monitor';
import { handleRpcRequest } from './api/rpc';

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  WEBAPP_SKIP_AUTH?: string;
}

export default {
  // 1. Cron Trigger (Every 5 minutes)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = new DbClient(env.DB);
    const telegram = new TelegramService(
      {
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHAT_ID,
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
      },
      db
    );

    ctx.waitUntil(runMonitorCycle(db, telegram));
  },

  // 2. HTTP Request Handler (Telegram Webhook & Mini App RPC)
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, Authorization',
        },
      });
    }

    const db = new DbClient(env.DB);
    const telegram = new TelegramService(
      {
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHAT_ID,
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
      },
      db
    );

    const triggerMonitorFn = () => runMonitorCycle(db, telegram);

    // Telegram Bot Webhook
    if (url.pathname === '/webhook/telegram' || url.pathname === '/webhook') {
      if (request.method === 'POST') {
        return telegram.handleWebhook(request, triggerMonitorFn);
      }
      return new Response('Webhook endpoint active. Send POST updates.', { status: 200 });
    }

    // Mini App API / RPC endpoint
    if (url.pathname === '/api/rpc' || url.searchParams.get('api') === '1') {
      return handleRpcRequest(request, {
        db,
        telegram,
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHAT_ID,
        skipAuth: env.WEBAPP_SKIP_AUTH === '1',
        workerUrl: `${url.protocol}//${url.host}`,
        triggerMonitorFn,
      });
    }

    // Manual monitor trigger endpoint (for manual testing via browser or curl)
    if (url.pathname === '/run' || url.pathname === '/check') {
      const res = await triggerMonitorFn();
      return new Response(JSON.stringify(res, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
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

    return new Response('Not Found', { status: 404 });
  },
};
