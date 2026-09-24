import { DbClient } from '../db/client';
import { TelegramService } from './telegram';
import { fetchOffersForRoute } from '../providers';
import { computeOfferFingerprint } from '../utils/crypto';
import { routeMatchesOffer, offerMatchesUserFilters, isSilentHoursActive, formatIsoDate, addDays } from './filters';
import { NormalizedOffer, UserRoute, UserFilters, RunLog } from '../types';

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

    // Default window dates (today + 14 days)
    const today = new Date();
    const windowStart = formatIsoDate(today);
    const windowEnd = formatIsoDate(addDays(today, settings.window_days || 14));
    const windowDates = { start: windowStart, end: windowEnd };

    // Deduplicate routes to avoid redundant HTTP requests
    const uniqueRouteKey = (r: UserRoute) =>
      r.source === 'movacar' && (!r.destination_id || r.destination_id === '*')
        ? `${r.source}|${r.origin_id || '*'}|${r.origin_country || ''}|*|*`
        : `${r.source}|${r.origin_id || '*'}|${r.origin_country || ''}|${r.destination_id || '*'}|${r.destination_country || ''}`;
    const seenRoutes = new Set<string>();
    const routesToScan: UserRoute[] = [];

    for (const r of allRoutes) {
      // Check if provider is enabled
      const provKey = `provider_${r.source.toLowerCase()}_enabled`;
      if (settings[provKey] === false) continue;

      const key = uniqueRouteKey(r);
      if (!seenRoutes.has(key)) {
        seenRoutes.add(key);
        routesToScan.push(r.source === 'movacar' && (!r.destination_id || r.destination_id === '*')
          ? { ...r, destination_country: '' }
          : r);
      }
    }

    console.log(`Scanning ${routesToScan.length} unique routes for ${activeUsers.length} users.`);

    const foundOffers: NormalizedOffer[] = [];

    for (const route of routesToScan) {
      requestCount++;
      try {
        const offers = await fetchOffersForRoute(route, windowDates);
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
