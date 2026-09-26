import { NormalizedOffer, UserRoute, UserFilters } from '../types';
import { fetchJson } from '../utils/http';
import { DbClient } from '../db/client';

export interface RoadsurferStation {
  id: string;
  name: string;
  country: string;
  oneWay?: boolean;
}

let cachedStations: RoadsurferStation[] | null = null;
let cachedStationsTime = 0;

export async function getRoadsurferAllStations(db?: DbClient): Promise<RoadsurferStation[]> {
  const now = Date.now();
  if (cachedStations && now - cachedStationsTime < 6 * 3600 * 1000) {
    return cachedStations;
  }

  if (db) {
    const d1Cached = await db.getCache<RoadsurferStation[]>('roadsurfer:stations');
    if (d1Cached && Array.isArray(d1Cached) && d1Cached.length > 0) {
      cachedStations = d1Cached;
      cachedStationsTime = now;
      return d1Cached;
    }
  }

  try {
    const payload = await fetchJson<any[]>('https://booking.roadsurfer.com/api/en/rally/stations', {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://booking.roadsurfer.com/en/rally/pick',
        'X-Requested-Alias': 'rally.startStations',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      retries: 1,
    });

    const stations = (Array.isArray(payload) ? payload : [])
      .filter((s) => s && s.id != null && s.city && s.city.country && s.enabled !== false)
      .map((s) => ({
        id: String(s.id),
        name: s.name || (s.city && s.city.name) || '',
        country: String((s.city && s.city.country) || '').trim().toUpperCase(),
        oneWay: s.one_way === true,
      }));

    if (stations.length > 0) {
      cachedStations = stations;
      cachedStationsTime = now;
      if (db) {
        await db.setCache('roadsurfer:stations', stations, 86400); // 24 hours
      }
    }
    return stations;
  } catch (err) {
    console.error('Failed to fetch Roadsurfer stations:', err);
    return cachedStations || [];
  }
}

export async function fetchRoadsurferDestinations(
  originId: string,
  allowedDestCountries: string[] = [],
  db?: DbClient
): Promise<RoadsurferStation[]> {
  const cleanOriginId = String(originId || '').trim();
  if (!/^\d+$/.test(cleanOriginId)) {
    return [];
  }

  const cacheKey = `roadsurfer:destinations:${cleanOriginId}`;
  if (db) {
    const d1Cached = await db.getCache<RoadsurferStation[]>(cacheKey);
    if (d1Cached && Array.isArray(d1Cached) && d1Cached.length > 0) {
      return d1Cached.filter(
        (dest) =>
          allowedDestCountries.length === 0 ||
          !dest.country ||
          allowedDestCountries.includes(dest.country)
      );
    }
  }

  const url = `https://booking.roadsurfer.com/api/en/rally/stations/${encodeURIComponent(cleanOriginId)}`;
  try {
    const payload = await fetchJson<any>(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: `https://booking.roadsurfer.com/en/rally/pick?station=${encodeURIComponent(cleanOriginId)}`,
        'X-Requested-Alias': 'rally.fetchRoutes',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      retries: 1,
    });

    let returnIds: any[] = [];
    if (payload && Array.isArray(payload.returns)) returnIds = payload.returns;
    else if (payload && Array.isArray(payload.routes)) returnIds = payload.routes;
    else if (Array.isArray(payload)) returnIds = payload;

    const allStations = await getRoadsurferAllStations(db);
    const stationMap = new Map<string, RoadsurferStation>();
    for (const s of allStations) stationMap.set(s.id, s);

    const allDestinations: RoadsurferStation[] = [];
    for (const r of returnIds) {
      let dest: RoadsurferStation;
      if (typeof r === 'object' && r !== null) {
        const id = String(r.id || r.station_id);
        const name = r.name || r.station_name || '';
        const country = String(r.country || r.destination_country || '').toUpperCase().trim();
        dest = { id, name, country };
      } else {
        const id = String(r);
        const s = stationMap.get(id);
        dest = {
          id,
          name: s ? s.name : `Station ${id}`,
          country: s ? s.country : '',
        };
      }
      allDestinations.push(dest);
    }

    if (db && allDestinations.length > 0) {
      await db.setCache(cacheKey, allDestinations, 43200); // 12 hours
    }

    return allDestinations.filter(
      (dest) =>
        allowedDestCountries.length === 0 ||
        !dest.country ||
        allowedDestCountries.includes(dest.country)
    );
  } catch (e) {
    return [];
  }
}

export async function fetchRoadsurferTimeframes(
  originId: string,
  destinationId: string,
  db?: DbClient
): Promise<{ start: string; end: string }[]> {
  const origin = String(originId || '').trim();
  const destination = String(destinationId || '').trim();
  if (!/^\d+$/.test(origin) || !/^\d+$/.test(destination)) {
    return [];
  }

  const cacheKey = `roadsurfer:timeframes:${origin}:${destination}`;
  if (db) {
    const d1Cached = await db.getCache<{ start: string; end: string }[]>(cacheKey);
    if (d1Cached && Array.isArray(d1Cached)) {
      return d1Cached;
    }
  }

  const url = `https://booking.roadsurfer.com/api/en/rally/timeframes/${encodeURIComponent(origin)}-${encodeURIComponent(destination)}`;
  const referer = `https://booking.roadsurfer.com/en/rally/pick?station=${encodeURIComponent(origin)}&end_station=${encodeURIComponent(destination)}&currency=EUR`;

  try {
    const payload = await fetchJson<any>(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: referer,
        'X-Requested-Alias': 'rally.timeframes',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      retries: 1,
    });

    if (!payload) return [];

    let items: any[] = [];
    if (Array.isArray(payload)) items = payload;
    else if (payload.timeframes && Array.isArray(payload.timeframes)) items = payload.timeframes;
    else if (payload.ranges && Array.isArray(payload.ranges)) items = payload.ranges;
    else if (payload.results && Array.isArray(payload.results)) items = payload.results;
    else if (payload.data && Array.isArray(payload.data)) items = payload.data;

    const normalized: { start: string; end: string }[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      let start = '';
      let end = '';

      if (Array.isArray(item) && item.length >= 2) {
        start = String(item[0]).slice(0, 10);
        end = String(item[1]).slice(0, 10);
      } else if (typeof item === 'string') {
        const parts = item.split('/');
        if (parts.length === 2) {
          start = parts[0].slice(0, 10);
          end = parts[1].slice(0, 10);
        }
      } else if (item && typeof item === 'object') {
        start = String(item.start || item.start_date || item.startDate || item.pickup_date || item.pickupDate || item.from || '').slice(0, 10);
        end = String(item.end || item.end_date || item.endDate || item.return_date || item.returnDate || item.to || '').slice(0, 10);
      }

      if (start && end && start <= end) {
        const key = `${start}|${end}`;
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push({ start, end });
        }
      }
    }

    if (db) await db.setCache(cacheKey, normalized, normalized.length ? 1800 : 300);
    return normalized;
  } catch (err) {
    return [];
  }
}

export async function fetchRoadsurferOffers(
  route: UserRoute,
  windowDates: { start: string; end: string },
  filters?: UserFilters,
  db?: DbClient
): Promise<NormalizedOffer[]> {
  const isWildOrigin = !route.origin_id || route.origin_id === '*';
  const isWildDest = !route.destination_id || route.destination_id === '*';

  const allStations = await getRoadsurferAllStations(db);
  const stationMap = new Map<string, RoadsurferStation>();
  for (const s of allStations) stationMap.set(s.id, s);

  // Determine origins to check
  let originsToCheck: RoadsurferStation[] = [];
  if (isWildOrigin) {
    const allowedOrigins = (!route.origin_country || route.origin_country === '*') && filters?.allowed_origin_countries
      ? filters.allowed_origin_countries.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
      : [];
    originsToCheck = allStations.filter((s) => {
      const ocs = route.origin_country ? route.origin_country.toUpperCase().split(',').map(c => c.trim()) : [];
      return (
        s.oneWay === true &&
        (!route.origin_country || route.origin_country === '*' || route.origin_country === 'ALL' || route.origin_country === 'ANY' || ocs.includes(s.country)) &&
        (allowedOrigins.length === 0 || allowedOrigins.includes(s.country))
      );
    });
    // Limit origins to prevent subrequest exhaustion and rotate cursor across runs
    const limit = Math.min(filters?.roadsurfer_origins_per_run || 2, 2);
    if (originsToCheck.length > limit && db) {
      const cursorKey = `roadsurfer_cursor_${route.origin_country || 'ALL'}`;
      const rawCursor = await db.getSetting(cursorKey);
      let cursor = rawCursor ? Number(rawCursor) : 0;
      if (isNaN(cursor) || cursor < 0 || cursor >= originsToCheck.length) {
        cursor = 0;
      }
      const nextCursor = (cursor + limit) % originsToCheck.length;
      await db.setSetting(cursorKey, nextCursor);

      if (cursor + limit <= originsToCheck.length) {
        originsToCheck = originsToCheck.slice(cursor, cursor + limit);
      } else {
        originsToCheck = [
          ...originsToCheck.slice(cursor),
          ...originsToCheck.slice(0, (cursor + limit) % originsToCheck.length),
        ];
      }
    } else {
      originsToCheck = originsToCheck.slice(0, limit);
    }
  } else {
    const s = stationMap.get(String(route.origin_id));
    originsToCheck = [
      s || {
        id: String(route.origin_id),
        name: route.origin_name || `Station ${route.origin_id}`,
        country: route.origin_country || '',
      },
    ];
  }

  const allowedDestCountries = filters?.allowed_destination_countries
    ? filters.allowed_destination_countries.split(',').map((c) => c.trim().toUpperCase())
    : [];

  const offers: NormalizedOffer[] = [];

  for (const origin of originsToCheck) {
    let destinationsToCheck: RoadsurferStation[] = [];
    if (isWildDest) {
      destinationsToCheck = await fetchRoadsurferDestinations(origin.id, allowedDestCountries, db);
      if (route.destination_country && route.destination_country !== '*' && route.destination_country !== 'ALL' && route.destination_country !== 'ANY') {
        const dcs = route.destination_country.toUpperCase().split(',').map(c => c.trim());
        destinationsToCheck = destinationsToCheck.filter(
          (d) => dcs.includes(d.country)
        );
      }
    } else {
      const s = stationMap.get(String(route.destination_id));
      destinationsToCheck = [
        s || {
          id: String(route.destination_id),
          name: route.destination_name || `Station ${route.destination_id}`,
          country: route.destination_country || '',
        },
      ];
    }

    for (const destination of destinationsToCheck) {
      const timeframes = await fetchRoadsurferTimeframes(origin.id, destination.id, db);
      const activeTf =
        timeframes.length > 0
          ? timeframes.filter(
              (tf) => tf.start <= windowDates.end && tf.end >= windowDates.start
            )
          : [{ start: windowDates.start, end: windowDates.end }];

      if (timeframes.length > 0 && activeTf.length === 0) {
        // Known timeframes exist but none fall within requested window
        continue;
      }

      for (const tf of activeTf.slice(0, 5)) {
        const searchUrl = `https://booking.roadsurfer.com/api/en/rally/search?stations=${encodeURIComponent(
          `[[${origin.id},${destination.id}]]`
        )}&range=${encodeURIComponent(JSON.stringify([tf.start, tf.end]))}&currency=EUR`;

        try {
          const payload = await fetchJson<any>(searchUrl, {
            headers: {
              Accept: 'application/json, text/plain, */*',
              Referer: `https://booking.roadsurfer.com/en/rally/pick?station=${encodeURIComponent(origin.id)}&end_station=${encodeURIComponent(destination.id)}&currency=EUR`,
              'X-Requested-Alias': 'rally.search',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            retries: 1,
          });

          const items = Array.isArray(payload)
            ? payload
            : (payload && (payload.results || payload.data)) || [];

          for (const item of items) {
            if (!item || item.available === false || String(item.id).endsWith('-empty')) continue;

            const model = item.model || {};
            const avail = item.availability || {};
            const priceDetails = avail.price_details || {};
            const rentalItem = (priceDetails.rentals && priceDetails.rentals[0]) || {};

            let price = rentalItem.value ?? priceDetails.rental_per_day ?? item.price_per_day ?? item.price ?? 1;
            const pickup = item.pickup_date || avail.pickup_date || tf.start;
            const ret = item.return_date || avail.return_date || tf.end;

            const bookingUrl = `https://booking.roadsurfer.com/en/rally/pick?station=${encodeURIComponent(
              origin.id
            )}&end_station=${encodeURIComponent(destination.id)}&pickup_date=${pickup}&return_date=${ret}&currency=EUR`;

            offers.push({
              source: 'roadsurfer',
              offer_id: String(item.id || item.offer_id || crypto.randomUUID()),
              vehicle_id: String(item.vehicle_id || model.id || ''),
              vehicle: item.name || model.name || 'Roadsurfer Camper',
              vehicle_type: 'camper',
              origin: origin.name,
              origin_country: origin.country || route.origin_country || '',
              destination: destination.name,
              destination_country: destination.country || route.destination_country || '',
              pickup_date: pickup,
              return_date: ret,
              price: Number(price),
              currency: 'EUR',
              booking_url: bookingUrl,
              image_url: item.image_url || item.imageUrl || item.image || model.images?.[0]?.image?.url || model.image_url || model.imageUrl || model.image || undefined,
              sleeping_places: model.berths || model.sleeping || 4,
              operator_name: 'Roadsurfer',
              raw_json: JSON.stringify(item),
            });
          }
        } catch (e) {
          // ignore individual pair errors
        }
      }
    }
  }

  return offers;
}
