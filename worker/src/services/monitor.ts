import { DbClient } from '../db/client';
import { TelegramService } from './telegram';
import { fetchOffersForRoute } from '../providers';
import { computeOfferFingerprint } from '../utils/crypto';
import { routeMatchesOffer, offerMatchesUserFilters, isSilentHoursActive, formatIsoDate, addDays, parseIsoDate } from './filters';
import { NormalizedOffer, UserRoute, UserFilters, RunLog } from '../types';
import { setGasProxyUrl } from '../utils/http';
import { runWithProviderBudget } from '../utils/provider-budget';

export async function runMonitorCycle(
  db: DbClient,
  telegram: TelegramService,
  sendAlerts = false
): Promise<{ offersFound: number; alertsSent: number; alertsQueued?: number }> {
  const lockOwner = crypto.randomUUID();
  if (!(await db.acquireMonitorLock(lockOwner))) {
    console.log('Monitor scan already active; skipping duplicate invocation.');
    return { offersFound: 0, alertsSent: 0 };
  }
  const startedAt = new Date().toISOString();
  let offersFoundCount = 0;
  let alertsQueuedCount = 0;
  let requestCount = 0;
  let status = 'ok';
  let errorMsg: string | undefined = undefined;
  let shouldLogRun = true;

  try {
    const settings = await db.getSettings();
    if (settings.gas_proxy_url) {
      setGasProxyUrl(settings.gas_proxy_url);
    }
    if (settings.telegram_enabled === false) {
      console.log('Monitoring disabled by settings.');
      return { offersFound: 0, alertsSent: 0 };
    }

    const previousRun = await db.getLatestRun();
    const minimumGapMinutes = Math.max(1, Number(settings.minimum_scan_gap_minutes) || 8);
    if (previousRun?.started_at && Date.now() - Date.parse(previousRun.started_at) < minimumGapMinutes * 60000) {
      console.log('Recent monitor scan exists; skipping repeated trigger.');
      shouldLogRun = false;
      return { offersFound: 0, alertsSent: 0 };
    }

    const activeContexts = await db.listActiveMonitorContexts();
    const activeUsers = activeContexts.map((context) => context.user);
    if (activeUsers.length === 0) {
      console.log('No active users to monitor for.');
      return { offersFound: 0, alertsSent: 0 };
    }

    // Collect all active routes across all users
    const allRoutes: UserRoute[] = [];
    const userMap = new Map<string, { routes: UserRoute[]; filters: UserFilters }>();

    for (const context of activeContexts) {
      userMap.set(context.user.telegram_id, { routes: context.routes, filters: context.filters });
      for (const r of context.routes) {
        const src = (r.source || '').toLowerCase().trim();
        if (src === 'all' || src === 'any' || src === '*') {
          const providers = ['roadsurfer', 'movacar', 'indiecampers', 'imoova'];
          for (const p of providers) {
            allRoutes.push({ ...r, source: p });
          }
        } else if (src.includes(',')) {
          const providers = src.split(',').map(s => s.trim());
          for (const p of providers) {
            allRoutes.push({ ...r, source: p });
          }
        } else {
          allRoutes.push(r);
        }
      }
    }

    // Default window dates (fallback looking ahead at least 60 days for roadsurfer rally timeframes)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = formatIsoDate(today);
    const defaultWindowEnd = formatIsoDate(addDays(today, Math.max(settings.window_days || 14, 60)));

    // Deduplicate routes to avoid redundant HTTP requests
    const uniqueRouteKey = (r: UserRoute) => {
      const source = r.source.toLowerCase();
      if ((source === 'movacar' || source === 'imoova') && r.origin_id && r.origin_id !== '*') {
        return `${source}|${r.origin_id}|*`;
      }
      return (!r.destination_id || r.destination_id === '*')
        ? `${source}|${r.origin_id || '*'}|${r.origin_country || ''}|*|*`
        : `${source}|${r.origin_id || '*'}|${r.origin_country || ''}|${r.destination_id || '*'}|${r.destination_country || ''}`;
    };
    const routeIndexMap = new Map<string, number>();
    const routesToScan: UserRoute[] = [];

    for (const r of allRoutes) {
      // Check if provider is enabled
      const provKey = `provider_${r.source.toLowerCase()}_enabled`;
      if (settings[provKey] === false) continue;

      const key = uniqueRouteKey(r);
      const existingIdx = routeIndexMap.get(key);
      if (existingIdx === undefined) {
        routeIndexMap.set(key, routesToScan.length);
        routesToScan.push((!r.destination_id || r.destination_id === '*' || r.source === 'movacar' || r.source === 'imoova')
          ? { ...r, origin_country: r.origin_id && r.origin_id !== '*' && (r.source === 'movacar' || r.source === 'imoova') ? '' : r.origin_country,
              destination_id: r.source === 'movacar' || r.source === 'imoova' ? '*' : r.destination_id,
              destination_name: r.source === 'movacar' || r.source === 'imoova' ? '' : r.destination_name,
              destination_country: '' }
          : { ...r });
      } else {
        const existing = routesToScan[existingIdx];
        if (r.pickup_date && (!existing.pickup_date || r.pickup_date < existing.pickup_date)) {
          existing.pickup_date = r.pickup_date;
        }
        if (r.return_date && (!existing.return_date || r.return_date > existing.return_date)) {
          existing.return_date = r.return_date;
        }
      }
    }

    routesToScan.sort((a, b) => uniqueRouteKey(a).localeCompare(uniqueRouteKey(b)));
    console.log(`Scanning ${routesToScan.length} unique routes for ${activeUsers.length} users.`);

    const foundOffers: NormalizedOffer[] = [];
    const budget = Math.min(40, Math.max(1, Number(settings.provider_request_budget) || 35));
    const rawCursor = Number(await db.getSetting('scan_route_cursor')) || 0;
    const cursor = routesToScan.length ? rawCursor % routesToScan.length : 0;
    let nextCursor = cursor;
    await runWithProviderBudget(budget, async (scope) => {
      for (let step = 0; step < routesToScan.length; step++) {
        const route = routesToScan[(cursor + step) % routesToScan.length];
        nextCursor = (cursor + step + 1) % routesToScan.length;
        try {
          const rPickup = parseIsoDate(route.pickup_date);
          const rReturn = parseIsoDate(route.return_date);
          const routeStart = (rPickup && rPickup > today) ? formatIsoDate(rPickup) : windowStart;
          const routeEnd = rReturn ? formatIsoDate(rReturn) : defaultWindowEnd;
          const offers = await fetchOffersForRoute(route, { start: routeStart, end: routeEnd }, undefined, db);
          foundOffers.push(...offers);
        } catch (err: any) {
          console.warn(`Error scanning route ${route.source} ${route.origin_id} -> ${route.destination_id}:`, err.message || err);
        }
        if (scope.used >= scope.limit) {
          status = 'partial';
          break;
        }
      }
      requestCount = scope.used;
      console.log(`Provider requests: ${scope.used}/${scope.limit}; by host: ${JSON.stringify(scope.byHost)}.`);
    });
    if (routesToScan.length) await db.setSetting('scan_route_cursor', nextCursor);

    offersFoundCount = foundOffers.length;

    // Deduplicate & Save offers, Dispatch alerts
    for (const offer of foundOffers) {
      const fingerprint = await computeOfferFingerprint(offer);
      offer.fingerprint = fingerprint;

      // Save / update in D1
      await db.saveOffer(offer, fingerprint);

      // Check which users want this offer
      for (const [telegramId, userContext] of userMap.entries()) {
        // Check subscription: only enqueue alerts for active subscribers
        const user = activeUsers.find(u => u.telegram_id === telegramId);
        if (!db.isSubscriptionActive(user || null)) continue;

        const matchedRoute = userContext.routes.find((r) => routeMatchesOffer(r, offer));
        if (!matchedRoute) continue;

        const matchesFilters = offerMatchesUserFilters(offer, userContext.filters, matchedRoute);
        if (!matchesFilters) continue;

        if (!sendAlerts) continue;

        const silent = isSilentHoursActive(userContext.filters, settings);

        // Send alert
        const chatId = user?.chat_id || telegramId;

        try {
          if (await db.enqueueAlert(telegramId, fingerprint, chatId, offer, matchedRoute, silent)) {
            alertsQueuedCount++;
          }
        } catch (sendErr: any) {
          console.error(`Failed to enqueue alert to ${chatId}:`, sendErr.message || sendErr);
        }
      }
    }
  } catch (err: any) {
    status = 'error';
    errorMsg = err.message || String(err);
    console.error('Monitor cycle failed:', err);
  } finally {
    const finishedAt = new Date().toISOString();
    try {
      if (shouldLogRun) await db.logRun({
        started_at: startedAt,
        finished_at: finishedAt,
        source: 'all',
        request_count: requestCount,
        offers_found: offersFoundCount,
        archived: offersFoundCount,
        alerts_sent: 0,
        status,
        error: errorMsg,
      });
    } finally {
      await db.releaseMonitorLock(lockOwner);
    }
  }

  return { offersFound: offersFoundCount, alertsSent: 0, alertsQueued: alertsQueuedCount };
}
