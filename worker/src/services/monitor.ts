import { DbClient } from '../db/client';
import { TelegramService } from './telegram';
import { fetchOffersForRoute } from '../providers';
import { computeOfferFingerprint } from '../utils/crypto';
import { routeMatchesOffer, offerMatchesUserFilters, isSilentHoursActive, formatIsoDate, addDays, parseIsoDate } from './filters';
import { NormalizedOffer, UserRoute, UserFilters, RunLog } from '../types';
import { setGasProxyUrl } from '../utils/http';

export async function runMonitorCycle(
  db: DbClient,
  telegram: TelegramService,
  sendAlerts = false
): Promise<{ offersFound: number; alertsSent: number }> {
  const lockOwner = crypto.randomUUID();
  if (!(await db.acquireMonitorLock(lockOwner))) {
    console.log('Monitor scan already active; skipping duplicate invocation.');
    return { offersFound: 0, alertsSent: 0 };
  }
  const startedAt = new Date().toISOString();
  let offersFoundCount = 0;
  let alertsSentCount = 0;
  let requestCount = 0;
  let status = 'ok';
  let errorMsg: string | undefined = undefined;

  try {
    const settings = await db.getSettings();
    if (settings.gas_proxy_url) {
      setGasProxyUrl(settings.gas_proxy_url);
    }
    if (settings.telegram_enabled === false) {
      console.log('Monitoring disabled by settings.');
      return { offersFound: 0, alertsSent: 0 };
    }

    const activeUsers = await db.listActiveUsers();
    if (activeUsers.length === 0) {
      console.log('No active users to monitor for.');
      return { offersFound: 0, alertsSent: 0 };
    }

    // Collect all active routes across all users
    const allRoutes: UserRoute[] = [];
    const userMap = new Map<string, { routes: UserRoute[]; filters: UserFilters }>();

    for (const u of activeUsers) {
      const routes = await db.getUserRoutes(u.telegram_id);
      const filters = await db.getUserFilters(u.telegram_id);
      const enabledRoutes = routes.filter((r) => r.enabled);

      userMap.set(u.telegram_id, { routes: enabledRoutes, filters });
      allRoutes.push(...enabledRoutes);
    }

    // Default window dates (fallback looking ahead at least 35 days for roadsurfer rally timeframes)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = formatIsoDate(today);
    const defaultWindowEnd = formatIsoDate(addDays(today, Math.max(settings.window_days || 14, 35)));

    // Deduplicate routes to avoid redundant HTTP requests
    const uniqueRouteKey = (r: UserRoute) =>
      (!r.destination_id || r.destination_id === '*')
        ? `${r.source}|${r.origin_id || '*'}|${r.origin_country || ''}|*|*`
        : `${r.source}|${r.origin_id || '*'}|${r.origin_country || ''}|${r.destination_id || '*'}|${r.destination_country || ''}`;
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
        routesToScan.push((!r.destination_id || r.destination_id === '*')
          ? { ...r, destination_country: '' }
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

    console.log(`Scanning ${routesToScan.length} unique routes for ${activeUsers.length} users.`);

    const foundOffers: NormalizedOffer[] = [];

    for (const route of routesToScan) {
      requestCount++;
      try {
        const rPickup = parseIsoDate(route.pickup_date);
        const rReturn = parseIsoDate(route.return_date);
        const routeStart = (rPickup && rPickup > today) ? formatIsoDate(rPickup) : windowStart;
        const routeEnd = rReturn ? formatIsoDate(rReturn) : defaultWindowEnd;
        const windowDates = { start: routeStart, end: routeEnd };

        const offers = await fetchOffersForRoute(route, windowDates, undefined, db);
        foundOffers.push(...offers);
      } catch (err: any) {
        console.warn(`Error scanning route ${route.source} ${route.origin_id} -> ${route.destination_id}:`, err.message || err);
      }
    }

    offersFoundCount = foundOffers.length;

    // Deduplicate & Save offers, Dispatch alerts
    for (const offer of foundOffers) {
      const fingerprint = await computeOfferFingerprint(offer);
      offer.fingerprint = fingerprint;

      // Save / update in D1
      await db.saveOffer(offer, fingerprint);

      // Check which users want this offer
      for (const [telegramId, userContext] of userMap.entries()) {
        const matchedRoute = userContext.routes.find((r) => routeMatchesOffer(r, offer));
        if (!matchedRoute) continue;

        const matchesFilters = offerMatchesUserFilters(offer, userContext.filters, matchedRoute);
        if (!matchesFilters) continue;

        if (!sendAlerts) continue;
        const alreadySent = await db.hasAlertBeenSent(telegramId, fingerprint);
        if (alreadySent) continue;

        const silent = isSilentHoursActive(userContext.filters, settings);

        // Send alert
        const user = activeUsers.find((u) => u.telegram_id === telegramId);
        const chatId = user?.chat_id || telegramId;

        try {
          await telegram.sendOfferAlert(chatId, offer, matchedRoute, silent);
          alertsSentCount++;
          await db.markAlertSent(
            telegramId,
            fingerprint,
            `${offer.source}: ${offer.origin} -> ${offer.destination} (${offer.price}€)`
          );
        } catch (sendErr: any) {
          console.error(`Failed to send alert to ${chatId}:`, sendErr.message || sendErr);
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
      await db.logRun({
        started_at: startedAt,
        finished_at: finishedAt,
        source: 'all',
        request_count: requestCount,
        offers_found: offersFoundCount,
        archived: offersFoundCount,
        alerts_sent: alertsSentCount,
        status,
        error: errorMsg,
      });
    } finally {
      await db.releaseMonitorLock(lockOwner);
    }
  }

  return { offersFound: offersFoundCount, alertsSent: alertsSentCount };
}
