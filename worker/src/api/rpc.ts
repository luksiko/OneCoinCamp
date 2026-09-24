import { DbClient } from '../db/client';
import { TelegramService } from '../services/telegram';
import { SUPPORTED_PROVIDERS, WEBAPP_COUNTRIES } from '../config';
import { getRoadsurferAllStations, fetchRoadsurferDestinations } from '../providers/roadsurfer';
import { MOVACAR_COUNTRIES } from '../providers/movacar';
import { INDIECAMPERS_CITIES } from '../providers/indiecampers';
import { routeMatchesOffer, offerMatchesUserFilters } from '../services/filters';
import { fetchJson, setGasProxyUrl } from '../utils/http';
import { TelegramIdentity, verifyTelegramInitData } from '../utils/telegram-auth';

export interface RpcContext {
  db: DbClient;
  telegram: TelegramService;
  botToken: string;
  chatId?: string;
  workerUrl: string;
  triggerMonitorFn: () => Promise<any>;
}

export async function handleRpcRequest(request: Request, ctx: RpcContext): Promise<Response> {
  try {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const body = await request.json<any>();
    const method = body.method;
    const args = Array.isArray(body.args) ? body.args : [];
    const authArgIndex: Record<string, number> = {
      getUiData: 0, saveUiData: 1, checkProvidersHealth: 0,
      getOffers: 1, deleteOffer: 1, runMonitorFromUi: 0,
      registerTelegramWebhookWeb: 0, deleteTelegramWebhookWeb: 0,
      getProviderStations: 2, getProviderDestinations: 3,
      getAnalytics: 0, checkOffersAvailabilityWeb: 0, ensureTriggersFromUi: 0,
    };
    const authArg = args[authArgIndex[String(method)]];
    const initData = request.headers.get('X-Telegram-Init-Data') ||
      (typeof authArg === 'string' ? authArg : '');
    const identity = await verifyTelegramInitData(initData, ctx.botToken);
    if (!identity) return jsonError('Unauthorized', 401);
    const isAdmin = identity.id === ctx.chatId;
    if (['deleteOffer', 'runMonitorFromUi', 'registerTelegramWebhookWeb', 'deleteTelegramWebhookWeb', 'checkOffersAvailabilityWeb'].includes(method) && !isAdmin) {
      return jsonError('Forbidden', 403);
    }

    let result: any = null;

    switch (method) {
      case 'getUiData':
        result = await handleGetUiData(ctx, identity);
        break;
      case 'saveUiData':
        result = await handleSaveUiData(ctx, args[0], identity, isAdmin);
        break;
      case 'checkProvidersHealth':
        result = await handleCheckProvidersHealth(ctx);
        break;
      case 'getRoadsurferStations':
        result = await getRoadsurferAllStations(ctx.db);
        break;
      case 'getProviderStations':
        result = await getProviderStations(args[0], args[1], ctx.db);
        break;
      case 'getProviderDestinations':
        result = await getProviderDestinations(args[0], args[1], args[2], ctx.db);
        break;
      case 'getOffers':
        result = await getOffersForUi(ctx, identity.id, args[0]);
        break;
      case 'getAnalytics':
        result = await getAnalytics(ctx, identity.id);
        break;
      case 'ensureTriggersFromUi':
        result = [];
        break;
      case 'checkOffersAvailabilityWeb':
        result = await ctx.db.expirePastOffers();
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
        return jsonError(`Method not allowed: ${method}`, 400);
    }

    return new Response(JSON.stringify({ result }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });
}

async function handleGetUiData(ctx: RpcContext, identity: TelegramIdentity): Promise<any> {
  const userId = identity.id;
  await ctx.db.upsertUser(userId, identity.chatId || userId, identity.username);
  const user = await ctx.db.getUser(userId);

  const settings = await ctx.db.getSettings();
  const routes = await ctx.db.getUserRoutes(userId);
  const filters = await ctx.db.getUserFilters(userId);
  const latestRun = await ctx.db.getLatestRun();
  let webhookActive = false;
  try {
    const webhook = await fetchJson<any>(`https://api.telegram.org/bot${ctx.botToken}/getWebhookInfo`, { retries: 0 });
    webhookActive = Boolean(webhook?.ok && webhook.result?.url === `${ctx.workerUrl}/webhook/telegram`);
  } catch {}
  const interval = Number(settings.poll_interval_minutes) || 5;
  const ageMinutes = latestRun?.finished_at ? Math.floor((Date.now() - Date.parse(latestRun.finished_at)) / 60000) : null;
  const thresholdMinutes = Math.max(interval * 3, 15);
  const now = new Date();
  const windowDays = Number(filters.window_days || settings.window_days || 14);
  const windowStart = now.toISOString().slice(0, 10);
  const windowEnd = new Date(now.getTime() + windowDays * 86400000).toISOString().slice(0, 10);

  return {
    language: user?.language || identity.language || 'ru',
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
      allowed_origin_countries: splitCountries(filters.allowed_origin_countries),
      allowed_destination_countries: splitCountries(filters.allowed_destination_countries),
      min_trip_days: filters.min_duration_days || '',
      max_trip_days: filters.max_duration_days || '',
      max_price: filters.max_price,
      only_campers: filters.only_campers,
      vehicle_type: filters.vehicle_type,
      silent_hours_enabled: filters.silent_hours_enabled,
      silent_hours_start: filters.silent_hours_start,
      silent_hours_end: filters.silent_hours_end,
      window_days: filters.window_days,
    },
    settings: {
      ...settings,
      poll_interval_minutes: settings.poll_interval_minutes,
      timezone: settings.timezone,
      telegram_enabled: settings.telegram_enabled,
      provider_roadsurfer_enabled: settings.provider_roadsurfer_enabled,
      provider_movacar_enabled: settings.provider_movacar_enabled,
      provider_indiecampers_enabled: settings.provider_indiecampers_enabled,
      provider_imoova_enabled: settings.provider_imoova_enabled,
    },
    providers: SUPPORTED_PROVIDERS,
    supportedProviders: SUPPORTED_PROVIDERS,
    countries: WEBAPP_COUNTRIES,
    window: { start: windowStart, end: windowEnd, days: windowDays },
    telegramReady: Boolean(ctx.botToken),
    telegramMode: webhookActive ? 'webhook' : 'legacy',
    telegramWebhookActive: webhookActive,
    offersTabEnabled: true,
    monitorError: latestRun?.status === 'error' ? latestRun.error : '',
    status: {
      intervalMinutes: interval,
      lastRun: latestRun,
      freshness: { isStale: ageMinutes === null || ageMinutes > thresholdMinutes, ageMinutes, thresholdMinutes },
    },
  };
}

async function handleSaveUiData(ctx: RpcContext, payload: any, identity: TelegramIdentity, isAdmin: boolean): Promise<any> {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');
  const userId = identity.id;
  if (typeof payload.language === 'string' && /^[a-z]{2}$/.test(payload.language)) {
    await ctx.db.setUserLanguage(userId, payload.language);
  }

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
      max_price: f.max_price !== '' && f.max_price != null ? Number(f.max_price) : null,
      only_campers: Boolean(f.only_campers),
      vehicle_type: f.vehicle_type || 'all',
      silent_hours_enabled: Boolean(f.silent_hours_enabled),
      silent_hours_start: f.silent_hours_start,
      silent_hours_end: f.silent_hours_end,
      window_days: f.window_days ? Number(f.window_days) : 14,
      min_duration_days: f.min_trip_days !== '' && f.min_trip_days != null ? Number(f.min_trip_days) : null,
      max_duration_days: f.max_trip_days !== '' && f.max_trip_days != null ? Number(f.max_trip_days) : null,
    });
  }

  if (payload.settings && isAdmin) {
    for (const [k, v] of Object.entries(payload.settings)) {
      await ctx.db.setSetting(k, v);
    }
  }

  return { ok: true };
}

function splitCountries(value: string): string[] {
  return String(value || '').split(',').map((country) => country.trim()).filter(Boolean);
}

async function getProviderStations(provider: string, countries: string[] = [], db?: DbClient): Promise<any[]> {
  const countrySet = new Set((countries || []).map((country) => String(country).toUpperCase()));
  let stations: { id: string; name: string; country: string }[] = [];
  if (provider === 'roadsurfer') stations = await getRoadsurferAllStations(db);
  else if (provider === 'movacar') {
    const payload = await fetchJson<any>('https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de', {
      headers: { Accept: 'application/vnd.api+json', Origin: 'https://movacar.com', Referer: 'https://movacar.com/' },
      retries: 1,
    });
    stations = (payload?.included || [])
      .filter((item: any) => item.type === 'locationsummary' && item.attributes?.reference)
      .map((item: any) => ({ id: String(item.attributes.reference), name: String(item.attributes.name || ''), country: MOVACAR_COUNTRIES[item.attributes.name] || '' }));
    stations = [...new Map(stations.map((station) => [station.id, station])).values()];
  }
  else if (provider === 'indiecampers') stations = Object.entries(INDIECAMPERS_CITIES).map(([id, country]) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), country }));
  else return [];
  return stations.filter((station) => !countrySet.size || !station.country || countrySet.has(station.country)).sort((a, b) => a.name.localeCompare(b.name));
}

async function getProviderDestinations(provider: string, originId: string, countries: string[] = [], db?: DbClient): Promise<any[]> {
  if (provider === 'roadsurfer' && /^\d+$/.test(String(originId))) {
    return (await fetchRoadsurferDestinations(String(originId), countries, db)).sort((a, b) => a.name.localeCompare(b.name));
  }
  if (provider === 'movacar' && originId && originId !== '*') {
    const url = `https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de&origin_reference=${encodeURIComponent(originId)}`;
    const payload = await fetchJson<any>(url, {
      headers: { Accept: 'application/vnd.api+json', Origin: 'https://movacar.com', Referer: 'https://movacar.com/' },
      retries: 1,
    });
    const countrySet = new Set((countries || []).map((country) => String(country).toUpperCase()));
    const stations = (payload?.included || [])
      .filter((item: any) => item.type === 'locationsummary' && item.attributes?.location_type === 'destination' && item.attributes?.reference)
      .map((item: any) => ({ id: String(item.attributes.reference), name: String(item.attributes.name || ''), country: MOVACAR_COUNTRIES[item.attributes.name] || '' }))
      .filter((station: any) => !countrySet.size || !station.country || countrySet.has(station.country));
    return [...new Map(stations.map((station: any) => [station.id, station])).values()].sort((a: any, b: any) => a.name.localeCompare(b.name));
  }
  return (await getProviderStations(provider, countries, db)).filter((station) => station.id !== originId);
}

async function getOffersForUi(ctx: RpcContext, userId: string, filter: any = {}): Promise<any> {
  const rows = await ctx.db.getOfferArchive(userId);
  const routes = await ctx.db.getUserRoutes(userId);
  const filters = await ctx.db.getUserFilters(userId);
  const all = rows.map((row) => {
    const route = routes.find((candidate) => routeMatchesOffer(candidate, row));
    const matches = Boolean(route && offerMatchesUserFilters(row, filters, route));
    return {
      timestamp: row.found_at,
      source: row.source,
      operator: row.source,
      vehicleType: row.vehicle_type || 'unknown',
      offerId: row.offer_id,
      vehicleId: row.vehicle_id,
      vehicle: row.vehicle,
      origin: row.origin,
      originCountry: row.origin_country,
      destination: row.destination,
      destinationCountry: row.destination_country,
      pickupDate: row.pickup_date,
      returnDate: row.return_date,
      price: row.price,
      currency: row.currency,
      bookingUrl: row.booking_url,
      fingerprint: row.fingerprint,
      matches,
      telegramSentAt: row.telegram_sent_at,
    };
  });
  const availableSources = [...new Set(all.map((offer) => offer.source))].sort();
  const availableOperators = [...new Set(all.map((offer) => offer.operator))].sort();
  const criteria = filter && typeof filter === 'object' ? filter : {};
  const matched = all.filter((offer) => {
    if (criteria.source && offer.source !== criteria.source) return false;
    if (criteria.operator && criteria.operator !== 'all' && offer.operator !== criteria.operator) return false;
    if (criteria.vehicleType && criteria.vehicleType !== 'all' && offer.vehicleType !== criteria.vehicleType) return false;
    if (criteria.sentStatus === 'sent' && !offer.telegramSentAt) return false;
    if (criteria.sentStatus === 'new' && offer.telegramSentAt) return false;
    if (criteria.isMatched && !offer.matches) return false;
    if (criteria.dateFrom && offer.pickupDate < criteria.dateFrom) return false;
    if (criteria.dateTo && offer.pickupDate > criteria.dateTo) return false;
    return true;
  });
  const page = Math.max(1, Math.floor(Number(criteria.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(criteria.limit) || 50)));
  return { offers: matched.slice((page - 1) * limit, page * limit), total: matched.length, page, totalPages: Math.ceil(matched.length / limit), availableSources, availableOperators };
}

async function getAnalytics(ctx: RpcContext, userId: string): Promise<any> {
  const rows = await ctx.db.getOfferArchive(userId);
  const routes = await ctx.db.getUserRoutes(userId);
  const filters = await ctx.db.getUserFilters(userId);
  const daily = new Map<string, { date: string; total: number; matched: number }>();
  const sources = new Map<string, { source: string; total: number; matched: number }>();
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const routeCounts = new Map<string, number>();
  for (const row of rows) {
    const date = String(row.found_at || '').slice(0, 10);
    if (!date) continue;
    const route = routes.find((candidate) => routeMatchesOffer(candidate, row));
    const matches = Boolean(route && offerMatchesUserFilters(row, filters, route));
    const day = daily.get(date) || { date, total: 0, matched: 0 };
    day.total++;
    if (matches) day.matched++;
    daily.set(date, day);
    const source = sources.get(row.source) || { source: row.source, total: 0, matched: 0 };
    source.total++;
    if (matches) source.matched++;
    sources.set(row.source, source);
    if (matches) {
      const hour = new Date(row.found_at).getUTCHours();
      if (Number.isInteger(hour)) hourly[hour].count++;
      const routeName = `${row.origin} → ${row.destination}`;
      routeCounts.set(routeName, (routeCounts.get(routeName) || 0) + 1);
    }
  }
  return {
    dailyCounts: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    topRoutes: [...routeCounts.entries()].map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    hourlyPattern: hourly,
    bySources: [...sources.values()].sort((a, b) => b.total - a.total),
  };
}

async function handleCheckProvidersHealth(ctx: RpcContext): Promise<Record<string, any>> {
  try {
    const settings = await ctx.db.getSettings();
    if (settings.gas_proxy_url) {
      setGasProxyUrl(settings.gas_proxy_url);
    }
  } catch (e) {}

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
    result.roadsurfer = { ok: false, message: `Ошибка: ${(e.message || String(e)).slice(0, 80)}` };
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
  const result = await fetchJson<any>(`https://api.telegram.org/bot${ctx.botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: ctx.telegram.getWebhookSecret() }),
  });
  await ctx.telegram.setChatMenuButton(undefined, ctx.workerUrl);
  if (ctx.chatId) {
    await ctx.telegram.setChatMenuButton(ctx.chatId, ctx.workerUrl);
  }
  return result;
}

async function deleteTelegramWebhook(ctx: RpcContext): Promise<any> {
  return fetchJson(`https://api.telegram.org/bot${ctx.botToken}/deleteWebhook`);
}
