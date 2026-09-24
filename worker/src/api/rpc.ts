import { DbClient } from '../db/client';
import { TelegramService } from '../services/telegram';
import { SUPPORTED_PROVIDERS, WEBAPP_COUNTRIES } from '../config';
import { getRoadsurferAllStations } from '../providers/roadsurfer';
import { fetchJson } from '../utils/http';

export interface RpcContext {
  db: DbClient;
  telegram: TelegramService;
  botToken: string;
  chatId?: string;
  skipAuth?: boolean;
  workerUrl: string;
  triggerMonitorFn: () => Promise<any>;
}

export async function handleRpcRequest(request: Request, ctx: RpcContext): Promise<Response> {
  try {
    const body = await request.json<any>();
    const method = body.method;
    const args = body.args || [];

    let result: any = null;

    switch (method) {
      case 'getUiData':
        result = await handleGetUiData(ctx, args[0]);
        break;
      case 'saveUiData':
        result = await handleSaveUiData(ctx, args[0], args[1]);
        break;
      case 'checkProvidersHealth':
        result = await handleCheckProvidersHealth(ctx);
        break;
      case 'getRoadsurferStations':
        result = await getRoadsurferAllStations();
        break;
      case 'getOffers':
        result = await ctx.db.getOffers(args[0] || 100, args[1] || 0);
        break;
      case 'deleteOffer':
        await ctx.db.deleteOffer(args[0]);
        result = { success: true };
        break;
      case 'runMonitorFromUi':
        result = await ctx.triggerMonitorFn();
        break;
      case 'registerTelegramWebhookWeb':
        result = await registerTelegramWebhook(ctx);
        break;
      case 'deleteTelegramWebhookWeb':
        result = await deleteTelegramWebhook(ctx);
        break;
      default:
        return new Response(JSON.stringify({ error: `Method not allowed: ${method}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ result }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

async function handleGetUiData(ctx: RpcContext, initData?: string): Promise<any> {
  const userId = extractUserId(initData) || ctx.chatId || '5415085903';

  const settings = await ctx.db.getSettings();
  const routes = await ctx.db.getUserRoutes(userId);
  const filters = await ctx.db.getUserFilters(userId);
  const latestRun = await ctx.db.getLatestRun();

  return {
    user: { id: userId },
    routes: routes.map((r) => ({
      ...r,
      originName: r.origin_name,
      originId: r.origin_id,
      originCountry: r.origin_country,
      destinationName: r.destination_name,
      destinationId: r.destination_id,
      destinationCountry: r.destination_country,
      pickupDate: r.pickup_date,
      returnDate: r.return_date,
    })),
    filters: {
      allowed_origin_countries: filters.allowed_origin_countries,
      allowed_destination_countries: filters.allowed_destination_countries,
      max_price: filters.max_price,
      only_campers: filters.only_campers,
      vehicle_type: filters.vehicle_type,
      silent_hours_enabled: filters.silent_hours_enabled,
      silent_hours_start: filters.silent_hours_start,
      silent_hours_end: filters.silent_hours_end,
      window_days: filters.window_days,
    },
    settings: {
      poll_interval_minutes: settings.poll_interval_minutes,
      timezone: settings.timezone,
      telegram_enabled: settings.telegram_enabled,
      provider_roadsurfer_enabled: settings.provider_roadsurfer_enabled,
      provider_movacar_enabled: settings.provider_movacar_enabled,
      provider_indiecampers_enabled: settings.provider_indiecampers_enabled,
      provider_imoova_enabled: settings.provider_imoova_enabled,
    },
    providers: SUPPORTED_PROVIDERS,
    countries: WEBAPP_COUNTRIES,
    status: {
      lastRunAt: latestRun?.finished_at,
      status: latestRun?.status || 'ok',
      offersFound: latestRun?.offers_found || 0,
      alertsSent: latestRun?.alerts_sent || 0,
    },
  };
}

async function handleSaveUiData(ctx: RpcContext, payload: any, initData?: string): Promise<any> {
  const userId = extractUserId(initData) || ctx.chatId || '5415085903';

  if (payload.routes && Array.isArray(payload.routes)) {
    const formattedRoutes = payload.routes.map((r: any) => ({
      id: r.id || r._id,
      enabled: r.enabled !== false,
      source: r.source || 'roadsurfer',
      origin_name: r.originName || r.origin_name || '',
      origin_id: r.originId || r.origin_id || '*',
      origin_country: r.originCountry || r.origin_country || '',
      destination_name: r.destinationName || r.destination_name || '',
      destination_id: r.destinationId || r.destination_id || '*',
      destination_country: r.destinationCountry || r.destination_country || '',
      pickup_date: r.pickupDate || r.pickup_date || '',
      return_date: r.returnDate || r.return_date || '',
    }));
    await ctx.db.setUserRoutes(userId, formattedRoutes);
  }

  if (payload.filters) {
    const f = payload.filters;
    await ctx.db.setUserFilters(userId, {
      allowed_origin_countries: Array.isArray(f.allowed_origin_countries)
        ? f.allowed_origin_countries.join(',')
        : f.allowed_origin_countries,
      allowed_destination_countries: Array.isArray(f.allowed_destination_countries)
        ? f.allowed_destination_countries.join(',')
        : f.allowed_destination_countries,
      max_price: f.max_price != null ? Number(f.max_price) : null,
      only_campers: Boolean(f.only_campers),
      vehicle_type: f.vehicle_type || 'all',
      silent_hours_enabled: Boolean(f.silent_hours_enabled),
      silent_hours_start: f.silent_hours_start,
      silent_hours_end: f.silent_hours_end,
      window_days: f.window_days ? Number(f.window_days) : 14,
    });
  }

  if (payload.settings) {
    for (const [k, v] of Object.entries(payload.settings)) {
      await ctx.db.setSetting(k, v);
    }
  }

  return { success: true };
}

async function handleCheckProvidersHealth(ctx: RpcContext): Promise<Record<string, any>> {
  const result: Record<string, any> = {
    roadsurfer: { ok: false, message: 'Проверка…' },
    movacar: { ok: false, message: 'Проверка…' },
    indiecampers: { ok: false, message: 'Проверка…' },
    imoova: { ok: false, message: 'Проверка…' },
    telegram: { ok: false, message: 'Не настроен' },
  };

  // 1. Roadsurfer
  try {
    const t0 = Date.now();
    const rs = await fetchJson<any>('https://booking.roadsurfer.com/api/en/rally/stations/6', {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-Alias': 'rally.fetchRoutes',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      retries: 0,
    });
    const ms = Date.now() - t0;
    const routesCount = rs && Array.isArray(rs.returns) ? rs.returns.length : (Array.isArray(rs) ? rs.length : 0);
    result.roadsurfer = { ok: true, message: `Онлайн (${routesCount} направлений, ${ms}мс)` };
  } catch (e: any) {
    result.roadsurfer = { ok: false, message: `Ошибка: ${(e.message || String(e)).slice(0, 50)}` };
  }

  // 2. Movacar
  try {
    const t0 = Date.now();
    const mv = await fetchJson<any>(
      'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de&origin_reference=01JCRJ5NGV9E2YFNVSYKJR9W3J',
      {
        headers: {
          Accept: 'application/vnd.api+json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        retries: 0,
      }
    );
    const ms = Date.now() - t0;
    const count = mv && Array.isArray(mv.data) ? mv.data.length : 0;
    result.movacar = { ok: true, message: `Онлайн (${count} слотов, ${ms}мс)` };
  } catch (e: any) {
    result.movacar = { ok: false, message: `Ошибка: ${(e.message || String(e)).slice(0, 50)}` };
  }

  // 3. Indie Campers
  try {
    const t0 = Date.now();
    const ic = await fetchJson<any>('https://edge.indiecampers.com/api/v3/availability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://indiecampers.com',
      },
      body: JSON.stringify({
        booking: {
          checkin_city: 'lisbon',
          checkout_city: 'porto',
          checkin_datetime: '2026-10-01T16:30:00+00:00',
          checkout_datetime: '2026-10-10T11:00:00+00:00',
          locale: 'en',
          legacy_search: false,
          van_category: '',
          limit: 20,
          offset: 0,
          only_marketplace: false,
        },
        filters: {},
        meta: { current_route: 'rent-an-rv-search' },
      }),
      retries: 0,
    });
    const ms = Date.now() - t0;
    const count = ic?.data?.availability?.length || 0;
    result.indiecampers = { ok: true, message: `Онлайн (${count} слотов, ${ms}мс)` };
  } catch (e: any) {
    result.indiecampers = { ok: false, message: `Ошибка: ${(e.message || String(e)).slice(0, 50)}` };
  }

  // 4. Imoova
  try {
    const t0 = Date.now();
    const im = await fetchJson<any>('https://api.imoova.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.imoova.com',
      },
      body: JSON.stringify({
        query: 'query GetRelocations { relocations(first: 100) { data { id } } }',
        operationName: 'GetRelocations',
      }),
      retries: 0,
    });
    const ms = Date.now() - t0;
    const count = im?.data?.relocations?.data?.length || 0;
    result.imoova = { ok: true, message: `Онлайн (${count} слотов, ${ms}мс)` };
  } catch (e: any) {
    result.imoova = { ok: false, message: `Ошибка: ${(e.message || String(e)).slice(0, 50)}` };
  }

  // 5. Telegram
  if (ctx.botToken) {
    try {
      const t0 = Date.now();
      const tg = await fetchJson<any>(`https://api.telegram.org/bot${ctx.botToken}/getMe`, { retries: 0 });
      const ms = Date.now() - t0;
      if (tg?.ok && tg.result) {
        result.telegram = { ok: true, message: `Онлайн (@${tg.result.username || 'bot'}, ${ms}мс)` };
      } else {
        result.telegram = { ok: false, message: `Ошибка: ${tg?.description || 'не ок'}` };
      }
    } catch (e: any) {
      result.telegram = { ok: false, message: `Ошибка: ${(e.message || String(e)).slice(0, 50)}` };
    }
  }

  return result;
}

async function registerTelegramWebhook(ctx: RpcContext): Promise<any> {
  const webhookUrl = `${ctx.workerUrl}/webhook/telegram`;
  return fetchJson(`https://api.telegram.org/bot${ctx.botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });
}

async function deleteTelegramWebhook(ctx: RpcContext): Promise<any> {
  return fetchJson(`https://api.telegram.org/bot${ctx.botToken}/deleteWebhook`);
}

function extractUserId(initData?: string): string | null {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (userStr) {
      const u = JSON.parse(userStr);
      return String(u.id);
    }
  } catch (e) {}
  return null;
}
