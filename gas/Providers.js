function fetchOffersForRoute_(route, window, filters) {
  if (route.source === 'roadsurfer') {
    return fetchRoadsurferOffers_(route, window, filters);
  }
  if (route.source === 'movacar') {
    return fetchMovacarOffers_(route, window);
  }
  if (route.source === 'indiecampers') {
    return fetchIndieCampersOffers_(route, window);
  }
  if (route.source === 'imoova') {
    return fetchImoovaOffers_(route, window);
  }
  throw new Error('Unknown source: ' + route.source);
}


function isRoadsurferStationId_(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function isWildcardStation_(value) {
  const v = String(value || '').trim().toUpperCase();
  return !v || v === '*' || v === 'ALL' || v === 'ANY';
}

function getRoadsurferAllStations_() {
  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
  const cacheKey = 'roadsurfer:start-stations:v1';
  let stations = null;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try { stations = JSON.parse(cached); } catch (e) {}
    }
  }
  if (!stations) {
    const payload = fetchJson_('https://booking.roadsurfer.com/api/en/rally/stations', {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-Alias': 'rally.startStations',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      retries: 1,
    });
    stations = (Array.isArray(payload) ? payload : []).filter(function (station) {
      return station && station.id != null && station.city && station.city.country && station.enabled !== false;
    }).map(function (station) {
      return {
        id: String(station.id),
        name: station.name || (station.city && station.city.name) || '',
        country: String((station.city && station.city.country) || '').trim().toUpperCase(),
      };
    });
    if (cache && stations.length) {
      cache.put(cacheKey, JSON.stringify(stations), 21600);
    }
  }
  return stations;
}

function fetchRoadsurferDestinations_(originId, filters) {
  const cleanOriginId = String(originId || '').trim();
  if (!cleanOriginId || !isRoadsurferStationId_(cleanOriginId)) {
    return [];
  }

  const allowed = filters && filters.allowed_destination_countries
    ? parseCountryList_(filters.allowed_destination_countries)
    : [];

  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
  const cacheKey = 'roadsurfer:destinations:v1:' + cleanOriginId;
  let returnIds = null;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try { returnIds = JSON.parse(cached); } catch (e) {}
    }
  }

  if (!returnIds) {
    const url = 'https://booking.roadsurfer.com/api/en/rally/stations/' + encodeURIComponent(cleanOriginId);
    const payload = fetchJson_(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-Alias': 'rally.fetchRoutes',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      retries: 1,
    });

    if (payload && Array.isArray(payload.returns)) {
      returnIds = payload.returns;
    } else if (payload && Array.isArray(payload.routes)) {
      returnIds = payload.routes;
    } else if (Array.isArray(payload)) {
      returnIds = payload;
    } else {
      returnIds = [];
    }

    if (cache && returnIds.length) {
      // Route availability changes much more often than the station directory.
      // Keep destination discovery fresh enough to notice new Rally routes.
      cache.put(cacheKey, JSON.stringify(returnIds), 900);
    }
  }

  if (returnIds.length && typeof returnIds[0] === 'object' && returnIds[0] !== null) {
    return returnIds.filter(function (r) {
      const country = (r.country || r.destination_country || '').toUpperCase().trim();
      return allowed.length === 0 || allowed.indexOf(country) !== -1;
    }).map(function (r) {
      return {
        id: r.id || r.station_id,
        name: r.name || r.station_name || '',
        country: (r.country || r.destination_country || '').toUpperCase().trim(),
      };
    });
  }

  let stationMap = null;
  try {
    if (typeof getRoadsurferAllStations_ === 'function') {
      const all = getRoadsurferAllStations_();
      if (all && all.length) {
        stationMap = {};
        all.forEach(function (s) { stationMap[String(s.id)] = s; });
      }
    }
  } catch (e) {}

  return returnIds.map(function (destinationId) {
    const s = stationMap && stationMap[String(destinationId)];
    return {
      id: destinationId,
      name: s ? s.name : 'Station ' + destinationId,
      country: s ? (s.country || '') : '',
    };
  }).filter(function (r) {
    const country = (r.country || '').toUpperCase().trim();
    if (!country || allowed.length === 0) return true;
    return allowed.indexOf(country) !== -1;
  });
}

function resolveRoadsurferPairs_(route, filters) {
  const isWildOrigin = isWildcardStation_(route.originId);
  const isWildDest = isWildcardStation_(route.destinationId);

  // Fast path: specific origin and specific destination
  if (!isWildOrigin && isRoadsurferStationId_(route.originId) && !isWildDest && route.destinationId && isRoadsurferStationId_(route.destinationId)) {
    return [{
      origin: {
        id: String(route.originId),
        name: route.originName || ('Station ' + route.originId),
        country: route.originCountry || '',
      },
      destination: {
        id: String(route.destinationId),
        name: route.destinationName || ('Station ' + route.destinationId),
        country: route.destinationCountry || '',
      }
    }];
  }

  // Specific origin, but wildcard / unselected destination
  if (!isWildOrigin && isRoadsurferStationId_(route.originId)) {
    const orig = {
      id: String(route.originId),
      name: route.originName || ('Station ' + route.originId),
      country: route.originCountry || '',
    };
    const dests = fetchRoadsurferDestinations_(orig.id, filters);
    const targetDestCountry = (route.destinationCountry || '').toUpperCase().trim();
    const specificDestId = !isWildDest && route.destinationId && isRoadsurferStationId_(route.destinationId)
      ? String(route.destinationId)
      : null;
    const pairs = [];
    for (let j = 0; j < dests.length; j++) {
      const dest = dests[j];
      if (specificDestId && String(dest.id) !== specificDestId) {
        continue;
      }
      const destCountry = (dest.country || '').toUpperCase().trim();
      if (targetDestCountry && destCountry && destCountry !== targetDestCountry) {
        continue;
      }
      pairs.push({ origin: orig, destination: dest });
    }
    return pairs;
  }

  return resolveRoadsurferPairsBatched_(route, filters);
}

function resolveRoadsurferPairsBatched_(route, filters) {
  const isWildDest = isWildcardStation_(route.destinationId);

  const rawOriginCountry = String(route.originCountry || '').trim().toUpperCase();
  const targetOriginCountry = (rawOriginCountry === '*' || rawOriginCountry === 'ANY' || rawOriginCountry === 'ALL') ? '' : rawOriginCountry;
  const targetDestCountry = String(route.destinationCountry || '').trim().toUpperCase();
  
  const allowedOriginCountries = targetOriginCountry
    ? [targetOriginCountry]
    : (filters && filters.allowed_origin_countries ? parseCountryList_(filters.allowed_origin_countries) : []);
    
  const allowedDestCountries = targetDestCountry
    ? [targetDestCountry]
    : (filters && filters.allowed_destination_countries ? parseCountryList_(filters.allowed_destination_countries) : []);

  const allStations = getRoadsurferAllStations_();
  const originStations = allStations.filter(function (station) {
    const stCountry = String(station.country || '').trim().toUpperCase();
    if (allowedOriginCountries.length > 0 && stCountry && allowedOriginCountries.indexOf(stCountry) === -1) return false;
    return true;
  });
  if (!originStations.length) return [];

  const batchSize = roadsurferRadarBatchSize_(filters);
  const cursorKey = roadsurferRadarCursorKey_(route, filters);
  const props = typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties
    ? PropertiesService.getScriptProperties()
    : null;
  let cursor = 0;
  if (props) {
    const rawCursor = Number(props.getProperty(cursorKey));
    if (isFinite(rawCursor) && rawCursor >= 0) cursor = Math.floor(rawCursor);
  }
  cursor = cursor % originStations.length;

  const selectedOrigins = originStations.slice(cursor, Math.min(cursor + batchSize, originStations.length));
  const nextCursor = cursor + selectedOrigins.length >= originStations.length ? 0 : cursor + selectedOrigins.length;
  if (props) props.setProperty(cursorKey, String(nextCursor));

  const specificDestId = !isWildDest && route.destinationId && isRoadsurferStationId_(route.destinationId)
    ? String(route.destinationId)
    : null;
  const pairs = [];

  for (let i = 0; i < selectedOrigins.length; i += 1) {
    const origin = selectedOrigins[i];
    const destinations = fetchRoadsurferDestinations_(origin.id, filters);
    for (let j = 0; j < destinations.length; j += 1) {
      const destination = destinations[j];
      if (specificDestId && String(destination.id) !== specificDestId) continue;

      const destinationCountry = String(destination.country || '').trim().toUpperCase();
      if (targetDestCountry && destinationCountry && destinationCountry !== targetDestCountry) continue;
      if (!targetDestCountry && allowedDestCountries.length && destinationCountry && allowedDestCountries.indexOf(destinationCountry) === -1) continue;

      pairs.push({ origin: origin, destination: destination });
    }
  }

  return pairs;
}

function roadsurferRadarBatchSize_(filters) {
  const raw = Number(filters && filters.roadsurfer_origins_per_run);
  if (!isFinite(raw) || raw <= 0) return 15;
  return Math.max(1, Math.min(50, Math.floor(raw)));
}

function roadsurferRadarCursorKey_(route, filters) {
  const originCountry = String(route.originCountry || 'ANY').trim().toUpperCase() || 'ANY';
  const destinationCountry = String(route.destinationCountry || '').trim().toUpperCase();
  const destinationFilter = destinationCountry || String((filters && filters.allowed_destination_countries) || 'ANY').trim().toUpperCase();
  return 'ROADSURFER_RADAR_CURSOR:' + originCountry + ':' + destinationFilter.replace(/[^A-Z0-9,_-]/g, '');
}

function fetchRoadsurferTimeframes_(originId, destinationId) {
  const origin = String(originId || '').trim();
  const destination = String(destinationId || '').trim();
  if (!isRoadsurferStationId_(origin) || !isRoadsurferStationId_(destination)) {
    return [];
  }

  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
  const cacheKey = 'roadsurfer:timeframes:v1:' + origin + ':' + destination;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
  }

  const url = 'https://booking.roadsurfer.com/api/en/rally/timeframes/' +
    encodeURIComponent(origin) + '-' + encodeURIComponent(destination);
  const referer = 'https://booking.roadsurfer.com/en/rally/pick?station=' +
    encodeURIComponent(origin) + '&end_station=' + encodeURIComponent(destination) + '&currency=EUR';

  let payload;
  try {
    payload = fetchJson_(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: referer,
        'X-Requested-Alias': 'rally.timeframes',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      retries: 1,
    });
  } catch (e) {
    return null;
  }

  if (!payload || (typeof payload === 'object' && !Array.isArray(payload) && !payload.timeframes && !payload.ranges && !payload.results && !payload.data)) {
    return null;
  }

  const normalized = normalizeRoadsurferTimeframes_(payload);
  if (cache && Array.isArray(normalized)) {
    try { cache.put(cacheKey, JSON.stringify(normalized), 180); } catch (e) {}
  }
  return normalized;
}

function normalizeRoadsurferTimeframes_(payload) {
  let items = [];
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && Array.isArray(payload.timeframes)) {
    items = payload.timeframes;
  } else if (payload && Array.isArray(payload.ranges)) {
    items = payload.ranges;
  } else if (payload && Array.isArray(payload.results)) {
    items = payload.results;
  } else if (payload && Array.isArray(payload.data)) {
    items = payload.data;
  } else if (payload && payload.data && Array.isArray(payload.data.timeframes)) {
    items = payload.data.timeframes;
  }

  const normalized = [];
  const seen = {};

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    let start = null;
    let end = null;

    if (Array.isArray(item) && item.length >= 2) {
      start = item[0];
      end = item[1];
    } else if (typeof item === 'string') {
      const parts = item.split('/');
      if (parts.length === 2) {
        start = parts[0];
        end = parts[1];
      }
    } else if (item && typeof item === 'object') {
      const source = item.attributes && typeof item.attributes === 'object'
        ? Object.assign({}, item.attributes, item)
        : item;
      if (Array.isArray(source.range) && source.range.length >= 2) {
        start = source.range[0];
        end = source.range[1];
      } else {
        start = roadsurferIsoDate_(firstDefined_(source.start, source.start_date, source.startDate, source.pickup_date, source.pickupDate, source.from, source.departure_date, source.departureDate));
        end = roadsurferIsoDate_(firstDefined_(source.end, source.end_date, source.endDate, source.return_date, source.returnDate, source.to, source.arrival_date, source.arrivalDate));
      }
    }

    start = roadsurferIsoDate_(start);
    end = roadsurferIsoDate_(end);
    if (!start || !end || start > end) continue;

    const key = start + '|' + end;
    if (seen[key]) continue;
    seen[key] = true;
    normalized.push({ start: start, end: end });
  }

  if (items.length && !normalized.length) {
    throw new Error('Roadsurfer timeframes payload format is not supported');
  }

  normalized.sort(function (a, b) {
    if (a.start === b.start) return a.end < b.end ? -1 : (a.end > b.end ? 1 : 0);
    return a.start < b.start ? -1 : 1;
  });
  return normalized;
}

function roadsurferIsoDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatIsoDate_(value);
  }
  const raw = String(value == null ? '' : value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function roadsurferTimeframeInsideWindow_(timeframe, rangeStart, rangeEnd) {
  if (!timeframe || !timeframe.start || !timeframe.end) return false;
  return timeframe.start <= rangeEnd && timeframe.end >= rangeStart;
}

function fetchRoadsurferOffers_(route, window, filters) {
  const isWildOrigin = isWildcardStation_(route.originId);
  const isWildDest = isWildcardStation_(route.destinationId);

  if (!isWildOrigin && !isRoadsurferStationId_(route.originId)) {
    throw new Error('Roadsurfer origin_id must be a numeric station ID or wildcard (*)');
  }
  if (isWildOrigin && !route.originCountry) {
    throw new Error('Roadsurfer route needs origin_id or origin_country');
  }
  if (!isWildDest && route.destinationId && !isRoadsurferStationId_(route.destinationId)) {
    throw new Error('Roadsurfer destination_id must be a numeric station ID or wildcard (*)');
  }

  const pairs = resolveRoadsurferPairs_(route, filters);
  if (!pairs || pairs.length === 0) {
    return [];
  }

  const rangeStart = formatIsoDate_(window.start);
  const rangeEnd = formatIsoDate_(window.end);
  const allOffers = [];

  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    
    let matching = [];
    let timeframes = null;
    try {
      timeframes = fetchRoadsurferTimeframes_(pair.origin.id, pair.destination.id);
    } catch (e) {
      console.warn('Roadsurfer timeframes fetch failed, falling back to full range:', e.message || e);
    }

    if (timeframes === null) {
      matching = [{ start: rangeStart, end: rangeEnd }];
    } else if (timeframes.length > 0) {
      matching = timeframes.filter(function (timeframe) {
        return roadsurferTimeframeInsideWindow_(timeframe, rangeStart, rangeEnd);
      });
    }

    for (let j = 0; j < matching.length; j += 1) {
      const offers = fetchRoadsurferOffersForTimeframe_(pair, matching[j], route, rangeStart, rangeEnd, pairs.length);
      for (let k = 0; k < offers.length; k += 1) {
        allOffers.push(offers[k]);
      }
    }
  }

  return allOffers;
}

function fetchRoadsurferOffersForTimeframe_(pair, timeframe, route, searchRangeStart, searchRangeEnd, pairsCount) {
  const origin = pair.origin;
  const destination = pair.destination;
  const rangeStart = timeframe.start;
  const rangeEnd = timeframe.end;

  const refererUrl = 'https://booking.roadsurfer.com/en/rally/pick?station=' +
    encodeURIComponent(origin.id) +
    '&end_station=' + encodeURIComponent(destination.id) +
    '&pickup_date=' + rangeStart +
    '&return_date=' + rangeEnd +
    '&currency=EUR';
  const searchUrl = 'https://booking.roadsurfer.com/api/en/rally/search?stations=' +
    encodeURIComponent('[[' + origin.id + ',' + destination.id + ']]') +
    '&range=' + encodeURIComponent(JSON.stringify([rangeStart, rangeEnd])) +
    '&currency=EUR&models=' + encodeURIComponent('[]');

  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
  const cacheKey = 'roadsurfer:search:v1:' + origin.id + ':' + destination.id + ':' + rangeStart + ':' + rangeEnd;
  let payload = null;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try { payload = JSON.parse(cached); } catch (e) {}
    }
  }

  if (!payload) {
    try {
      payload = fetchJson_(searchUrl, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: refererUrl,
          'X-Requested-Alias': 'rally.search',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (cache && payload) {
        try { cache.put(cacheKey, JSON.stringify(payload), 180); } catch (e) {}
      }
    } catch (e) {
      if (pairsCount === 1 || String(e.message || e).includes('429') || String(e.message || e).includes('500')) {
        throw e;
      }
      console.error('Roadsurfer search failed for ' + origin.id + ' -> ' + destination.id + ':', e.message || e);
      return [];
    }
  }

  const items = Array.isArray(payload) ? payload : (payload && (payload.results || payload.data)) || [];
  const offers = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || item.available === false) continue;

    const model = item.model || {};
    const price = firstDefined_(item.price, item.total_price, item.totalPrice, item.amount);
    
    // Fix: the user requested to parse roadsurferIsoDate_ but fallback to searchRange if empty, not the exact timeframe start
    const pickupDate = roadsurferIsoDate_(firstDefined_(item.pickup_date, item.pickupDate, rangeStart)) || rangeStart;
    const returnDate = roadsurferIsoDate_(firstDefined_(item.return_date, item.returnDate, rangeEnd)) || rangeEnd;
    
    // Check if the actual offer falls into user's overall search window
    if (pickupDate > searchRangeEnd || returnDate < searchRangeStart) {
      continue;
    }

    const originName = origin.name || route.originName || ('Station ' + origin.id);
    const destinationName = destination.name || route.destinationName || ('Station ' + destination.id);
    const bookingUrl = 'https://booking.roadsurfer.com/en/rally/pick?station=' +
      encodeURIComponent(origin.id) +
      '&end_station=' + encodeURIComponent(destination.id) +
      '&pickup_date=' + pickupDate +
      '&return_date=' + returnDate +
      '&currency=EUR';

    offers.push({
      source: 'roadsurfer',
      offerId: String(firstDefined_(item.id, item.offer_id, Utilities.getUuid())),
      vehicleId: String(firstDefined_(item.vehicle_id, model.id, '')),
      vehicle: item.name || model.name || '',
      origin: originName,
      originCountry: origin.country || route.originCountry || '',
      destination: destinationName,
      destinationCountry: destination.country || route.destinationCountry || '',
      pickupDate: pickupDate,
      returnDate: returnDate,
      price: price == null ? '' : Number(price),
      currency: String(firstDefined_(item.currency, 'EUR')),
      bookingUrl: bookingUrl,
      rawJson: JSON.stringify(item),
    });
  }
  return offers;
}

function fetchMovacarOffers_(route, window) {
  let originRef = route.originId;
  let destRef = route.destinationId;

  // Backwards compatibility for old manual text inputs
  if (!originRef || (!destRef && !isWildcardStation_(destRef))) {
    if (route.originName && !isWildcardStation_(route.originName) && route.destinationName && !isWildcardStation_(route.destinationName)) {
      const allLocationsUrl = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de';
      const payloadAll = fetchJson_(allLocationsUrl, {
        headers: { Accept: 'application/vnd.api+json', Origin: 'https://movacar.com', 'X-Request-Id': randomRequestId_() },
        retries: 1
      });
      const includedAll = payloadAll.included || [];
      const oName = String(route.originName).toLowerCase().trim();
      const dName = String(route.destinationName).toLowerCase().trim();
      const originLoc = includedAll.filter(function(item) { return item.type === 'locationsummary' && item.attributes && item.attributes.location_type === 'origin' && (item.attributes.name || '').toLowerCase().indexOf(oName) !== -1; })[0];
      const destLoc = includedAll.filter(function(item) { return item.type === 'locationsummary' && item.attributes && item.attributes.location_type === 'destination' && (item.attributes.name || '').toLowerCase().indexOf(dName) !== -1; })[0];
      if (!originLoc || !destLoc) return [];
      originRef = originLoc.attributes.reference;
      destRef = destLoc.attributes.reference;
    } else {
      return [];
    }
  }

  const isWildOrigin = isWildcardStation_(originRef);
  const isWildDest = isWildcardStation_(destRef);

  let originsToCheck = [];
  if (isWildOrigin) {
    const allStations = getMovacarAllStations_();
    originsToCheck = allStations.filter(function (s) {
      return !route.originCountry || String(route.originCountry).toUpperCase() === String(s.country).toUpperCase();
    });
  } else {
    originsToCheck = [{ id: originRef, name: route.originName }];
  }

  const foundOffers = [];

  for (let i = 0; i < originsToCheck.length; i++) {
    const origin = originsToCheck[i];
    let query = 'locale=de&origin_reference=' + encodeURIComponent(origin.id);
    if (!isWildDest) {
      query += '&destination_reference=' + encodeURIComponent(destRef);
    }
    const url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/offers?locale=en&origin=' + encodeURIComponent(origin.id) + (isWildDest ? '' : '&destination=' + encodeURIComponent(destRef));
    
    const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
    const cacheKey = 'movacar:offers:v1:' + origin.id + ':' + (isWildDest ? 'all' : destRef);
    let payload = null;
    if (cache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        try { payload = JSON.parse(cached); } catch (e) {}
      }
    }

    if (!payload) {
      try {
        payload = fetchJson_(url, {
          headers: {
            Accept: 'application/vnd.api+json',
            Origin: 'https://movacar.com',
            Referer: 'https://movacar.com/',
            'X-Request-Id': randomRequestId_()
          },
          retries: 1
        });
        if (cache && payload && (payload.data || payload.included)) {
          try { cache.put(cacheKey, JSON.stringify(payload), 180); } catch (e) {}
        }
      } catch (e) {
        if (originsToCheck.length === 1) {
          throw e;
        }
        console.warn('Movacar offers fetch failed for ' + origin.id + ':', e.message || e);
        continue;
      }
    }
    
    const included = payload.included || [];
    const stations = {};
    const prices = {};
    for (let j = 0; j < included.length; j++) {
      if (included[j].type === 'station') {
        stations[included[j].id] = included[j].attributes;
      } else if (included[j].type === 'monetary_amount') {
        prices[included[j].id] = included[j].attributes;
      }
    }

    const data = payload.data || [];
    for (let j = 0; j < data.length; j++) {
      const item = data[j];
      if (item.type !== 'offer') continue;
      
      const attrs = item.attributes || {};
      const rels = item.relationships || {};
      
      const destData = (rels.destination && rels.destination.data) || {};
      const destStation = stations[destData.id] || {};
      const destName = destStation.city || destStation.alternative_city || 'Unknown';
      const destCountry = MOVACAR_COUNTRIES[destName] || '';
      const destReference = destStation.reference || destRef;

      if (isWildDest && route.destinationCountry && destCountry) {
        if (String(route.destinationCountry).toUpperCase() !== String(destCountry).toUpperCase()) continue;
      }
      
      const priceData = (rels.base_price && rels.base_price.data) || {};
      const priceInfo = prices[priceData.id];
      const priceVal = priceInfo ? (priceInfo.amount_minor_units / 100) : 1;
      
      let vName = attrs.make || attrs.model || attrs.vehicle_category_name || 'Movacar vehicle';
      if (attrs.model && attrs.model !== vName) vName += ' ' + attrs.model;
      
      const pDateStr = attrs.start_date || formatIsoDate_(window.start);
      const rDateStr = attrs.end_date || formatIsoDate_(window.end);
      const oId = attrs.offer_id || item.id;

      const originData = (rels.origin && rels.origin.data) || {};
      const originStation = stations[originData.id] || {};
      const originCity = originStation.city || originStation.alternative_city || origin.name;
      const originReference = originStation.reference || origin.id;

      const bookingParams = [];
      if (originCity) bookingParams.push('origin=' + encodeURIComponent(originCity));
      if (originReference && !isWildcardStation_(originReference)) bookingParams.push('oid=' + encodeURIComponent(originReference));
      if (destName && destName !== 'Unknown') bookingParams.push('destination=' + encodeURIComponent(destName));
      if (destReference && !isWildcardStation_(destReference)) bookingParams.push('did=' + encodeURIComponent(destReference));

      const movacarUrl = bookingParams.length > 0
        ? 'https://www.movacar.com/offers?' + bookingParams.join('&')
        : 'https://www.movacar.com/offers';

      foundOffers.push({
        source: 'movacar',
        offerId: String(oId),
        vehicleId: '',
        vehicle: String(vName).trim(),
        origin: originCity,
        originCountry: route.originCountry,
        destination: destName,
        destinationCountry: destCountry || route.destinationCountry,
        pickupDate: pDateStr.split('T')[0],
        returnDate: rDateStr.split('T')[0],
        price: priceVal,
        bookingUrl: movacarUrl
      });
    }
  }

  return foundOffers;
}

function firstDefined_() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
      return arguments[i];
    }
  }
  return undefined;
}


const MOVACAR_COUNTRIES = {
  "Brüssel": "BE",
  "Pullach": "DE",
  "Hamburg": "DE",
  "Kempten": "DE",
  "Weyhe (bei Bremen)": "DE",
  "Lille": "FR",
  "Bergamo": "IT",
  "Paris CDG Flughafen": "FR",
  "Bonn": "DE",
  "Dormagen (bei Düsseldorf)": "DE",
  "A Coruña": "ES",
  "Viladecans (bei Barcelona)": "ES",
  "Kastorf (bei Lübeck)": "DE",
  "Paris": "FR",
  "Schüpfen": "CH",
  "Toulouse": "FR",
  "Bologna": "IT",
  "Ettlingenweier": "DE",
  "Sevilla": "ES",
  "Saint-Alban (bei Toulouse)": "FR",
  "Erfurt": "DE",
  "Zürich": "CH",
  "Freiburg im Breisgau": "DE",
  "Jena": "DE",
  "Maura (bei Oslo Flughafen)": "NO",
  "Olbia": "IT",
  "Saint-Mesmes (bei Paris)": "FR",
  "Frankfurt am Main": "DE",
  "Rom": "IT",
  "Castellanza (bei Mailand)": "IT",
  "València": "ES",
  "Singen": "DE",
  "Rotterdam": "NL",
  "Sint-Pieters-Leeuw (bei Brüssel)": "BE",
  "Korntal-Münchingen (bei Stuttgart)": "DE",
  "Ferno": "IT",
  "Stockholm": "SE",
  "Venedig": "IT",
  "Offenburg": "DE",
  "Zamudio (near Bilbao)": "ES",
  "Madrid": "ES",
  "Turin": "IT",
  "Antwerpen": "BE",
  "Potsdam": "DE",
  "Stuttgart": "DE",
  "Duisburg": "DE",
  "Alcalá de Henares": "ES",
  "Nantes": "FR",
  "Ingolstadt": "DE",
  "München": "DE",
  "Graz": "AT",
  "Berlin": "DE",
  "Braunschweig": "DE",
  "Saarbrücken": "DE",
  "London": "GB",
  "Málaga": "ES",
  "Cabriès (bei Marseille)": "FR",
  "Aach (bei Konstanz)": "DE",
  "Göteborg": "SE",
  "Kassel": "DE",
  "Saint-Jean-de-Gonville (bei Genf)": "FR",
  "Leipzig": "DE",
  "Salzgitter": "DE",
  "Gattières (bei Nizza)": "FR",
  "Hannover": "DE",
  "Marburg": "DE",
  "Florence": "IT",
  "Lindau": "DE",
  "Tromsø": "NO",
  "Würzburg": "DE",
  "Dagneux (bei Lyon)": "FR",
  "Göttingen": "DE",
  "Amstelveen (bei Amsterdam)": "NL",
  "Wolfsburg": "DE",
  "Bordeaux": "FR",
  "Dresden": "DE",
  "Westerland": "DE",
  "Staffanstorp (bei Malmö)": "SE",
  "Laatzen (bei Hannover)": "DE",
  "Weingarten": "DE",
  "Ihringen (bei Freiburg)": "DE",
  "Cagliari": "IT",
  "Pisa": "IT",
  "Magdeburg": "DE",
  "Bielefeld": "DE",
  "Pforzheim": "DE",
  "Barcelona": "ES",
  "Eberswalde": "DE",
  "Baden-Baden": "DE",
  "Alacant/Alicante": "ES"
};

function getMovacarAllStations_() {
  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
  const cacheKey = 'movacar:all-stations:v1';
  let stations = null;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try { stations = JSON.parse(cached); } catch (e) {}
    }
  }
  if (stations && Array.isArray(stations) && stations.length) {
    return stations;
  }

  const url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de';
  const payload = fetchJson_(url, {
    headers: {
      Accept: 'application/vnd.api+json',
      Origin: 'https://movacar.com',
      Referer: 'https://movacar.com/',
      'X-Request-Id': randomRequestId_(),
    },
    retries: 1
  });

  const included = payload.included || [];
  stations = [];
  const seen = {};

  for (let i = 0; i < included.length; i++) {
    const item = included[i];
    if (item.type === 'locationsummary' && item.attributes) {
      const name = item.attributes.name;
      // Use internal reference as the ID, this makes fetchMovacarOffers_ easier!
      const id = item.attributes.reference; 
      if (!seen[id]) {
        seen[id] = true;
        stations.push({
          id: id,
          name: name,
          country: MOVACAR_COUNTRIES[name] || '' // Fallback to empty if unknown
        });
      }
    }
  }
  if (cache && stations.length) {
    try {
      cache.put(cacheKey, JSON.stringify(stations), 21600);
    } catch (e) {}
  }
  return stations;
}

function fetchMovacarDestinations_(originRef, filters) {
  if (!originRef || originRef === '*' || originRef.toUpperCase() === 'ALL' || originRef.toUpperCase() === 'ANY') {
    return getMovacarAllStations_();
  }

  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
  const cacheKey = 'movacar:destinations:v1:' + originRef;
  let destinations = null;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try { destinations = JSON.parse(cached); } catch (e) {}
    }
  }

  if (!destinations) {
    const query = 'locale=de&origin_reference=' + encodeURIComponent(originRef);
    const url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?' + query;
    
    let payload;
    try {
      payload = fetchJson_(url, {
        headers: {
          Accept: 'application/vnd.api+json',
          Origin: 'https://movacar.com',
          Referer: 'https://movacar.com/',
          'X-Request-Id': randomRequestId_(),
        }
      });
    } catch (err) {
      return [];
    }

    const included = payload.included || [];
    destinations = [];
    const seen = {};

    for (let i = 0; i < included.length; i++) {
      const item = included[i];
      if (item.type === 'locationsummary' && item.attributes && item.attributes.location_type === 'destination') {
        const name = item.attributes.name;
        const id = item.attributes.reference;
        const cCode = MOVACAR_COUNTRIES[name] || '';
        
        if (!seen[id]) {
          seen[id] = true;
          destinations.push({
            id: id,
            name: name,
            country: cCode
          });
        }
      }
    }

    if (cache && destinations.length) {
      try {
        cache.put(cacheKey, JSON.stringify(destinations), 21600);
      } catch (e) {}
    }
  }

  const allowedCountries = (filters && filters.allowed_destination_countries)
    ? filters.allowed_destination_countries.split(',').map(function(c) { return c.trim().toUpperCase(); }).filter(Boolean)
    : [];

  if (!allowedCountries.length) {
    return destinations;
  }

  return destinations.filter(function (d) {
    if (!d.country) return true;
    return allowedCountries.indexOf(d.country) !== -1;
  });
}

// --- IndieCampers city slug → ISO2 country code ---
// Source: https://indiecampers.com/discover/en-us/sitemap.xml (European cities)
const INDIECAMPERS_CITIES = {
  'berlin': 'DE', 'hamburg': 'DE', 'munich': 'DE', 'frankfurt': 'DE',
  'cologne': 'DE', 'dusseldorf': 'DE', 'stuttgart': 'DE', 'dresden': 'DE',
  'hanover': 'DE', 'nuremberg': 'DE', 'leipzig': 'DE', 'bremen': 'DE',
  'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR', 'bordeaux': 'FR',
  'toulouse': 'FR', 'nice': 'FR', 'nantes': 'FR', 'strasbourg': 'FR',
  'madrid': 'ES', 'barcelona': 'ES', 'seville': 'ES', 'valencia': 'ES',
  'bilbao': 'ES', 'malaga': 'ES', 'granada': 'ES', 'zaragoza': 'ES',
  'rome': 'IT', 'milan': 'IT', 'naples': 'IT', 'florence': 'IT',
  'venice': 'IT', 'turin': 'IT', 'bologna': 'IT', 'palermo': 'IT',
  'lisbon': 'PT', 'porto': 'PT', 'faro': 'PT', 'braga': 'PT',
  'amsterdam': 'NL', 'rotterdam': 'NL', 'the-hague': 'NL', 'utrecht': 'NL',
  'brussels': 'BE', 'antwerp': 'BE', 'ghent': 'BE', 'bruges': 'BE',
  'vienna': 'AT', 'salzburg': 'AT', 'graz': 'AT', 'innsbruck': 'AT',
  'zurich': 'CH', 'geneva': 'CH', 'bern': 'CH', 'basel': 'CH',
  'london': 'GB', 'edinburgh': 'GB', 'manchester': 'GB', 'bristol': 'GB',
  'oslo': 'NO', 'bergen': 'NO', 'stavanger': 'NO', 'trondheim': 'NO',
  'stockholm': 'SE', 'gothenburg': 'SE', 'malmo': 'SE', 'Uppsala': 'SE',
  'copenhagen': 'DK', 'aarhus': 'DK', 'odense': 'DK',
  'helsinki': 'FI', 'tampere': 'FI', 'turku': 'FI',
  'dublin': 'IE', 'cork': 'IE', 'galway': 'IE',
  'reykjavik': 'IS', 'akureyri': 'IS',
  'warsaw': 'PL', 'krakow': 'PL', 'gdansk': 'PL', 'wroclaw': 'PL',
  'prague': 'CZ', 'brno': 'CZ', 'ostrava': 'CZ',
  'budapest': 'HU', 'debrecen': 'HU',
  'zagreb': 'HR', 'split': 'HR', 'dubrovnik': 'HR',
  'athens': 'GR', 'thessaloniki': 'GR', 'heraklion': 'GR',
};

function getIndieCampersAllStations_() {
  const stations = [];
  const seen = {};
  for (const slug in INDIECAMPERS_CITIES) {
    const country = INDIECAMPERS_CITIES[slug];
    const name = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
    if (!seen[slug]) {
      seen[slug] = true;
      stations.push({ id: slug, name: name, country: country });
    }
  }
  return stations;
}

function fetchIndieCampersOffers_(route, window) {
  const pickupDate = (window && window.start) ? window.start : '2026-09-27';
  const returnDate = (window && window.end) ? window.end : '2026-10-07';

  const isWildOrigin = isWildcardStation_(route.originId);
  const isWildDest = isWildcardStation_(route.destinationId);

  let origins;
  if (isWildOrigin) {
    const all = getIndieCampersAllStations_();
    origins = all.filter(function(s) {
      return !route.originCountry || String(route.originCountry).toUpperCase() === s.country;
    });
  } else {
    const slug = String(route.originId || route.originName || '').toLowerCase().trim();
    origins = [{ id: slug, name: route.originName || slug, country: INDIECAMPERS_CITIES[slug] || '' }];
  }

  let destSlug = null;
  let destName = null;
  if (!isWildDest) {
    destSlug = String(route.destinationId || route.destinationName || '').toLowerCase().trim();
    destName = route.destinationName || destSlug;
  }

  const allOffers = [];

  for (let oi = 0; oi < origins.length; oi++) {
    const orig = origins[oi];
    const checkinCity = orig.id;

    const destCandidates = isWildDest ? getIndieCampersAllStations_().filter(function(s) {
      return s.id !== checkinCity &&
        (!route.destinationCountry || String(route.destinationCountry).toUpperCase() === s.country);
    }) : [{ id: destSlug, name: destName }];

    for (let di = 0; di < destCandidates.length; di++) {
      const dest = destCandidates[di];
      const payload = {
        booking: {
          checkin_city: checkinCity,
          checkout_city: dest.id,
          checkin_datetime: pickupDate + 'T16:30:00+00:00',
          checkout_datetime: returnDate + 'T11:00:00+00:00',
          locale: 'en',
          legacy_search: false,
          van_category: '',
          limit: 50,
          offset: 0,
          only_marketplace: false,
        },
        filters: {},
        meta: { current_route: 'rent-an-rv-search' }
      };

      let res = null;
      try {
        res = fetchJson_('https://edge.indiecampers.com/api/v3/availability', {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          headers: { Origin: 'https://indiecampers.com' }
        });
      } catch (err) {
        console.warn('IndieCampers availability fetch failed for ' + checkinCity + ' -> ' + dest.id + ':', err.message || err);
        continue;
      }

      const items = (res && res.data && Array.isArray(res.data.availability)) ? res.data.availability : [];
      const bookingUrl = 'https://indiecampers.com/rent-an-rv/search?from=' + checkinCity + '&to=' + dest.id + '&start=' + pickupDate + '&end=' + returnDate;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.available === false) continue;
        const vanId = item.van_id || item.van_category || ('ic_' + i);
        const price = item.total_cost || item.daily_cost || null;
        const vehicle = item.manufacturer_name || item.van_category || 'Indie Camper';
        allOffers.push({
          source: 'indiecampers',
          offerId: String(vanId) + '_' + checkinCity + '_' + dest.id,
          origin: orig.name,
          originCountry: orig.country || route.originCountry || '',
          destination: dest.name,
          destinationCountry: dest.country || route.destinationCountry || '',
          pickupDate: item.checkin_date || pickupDate,
          returnDate: item.checkout_date || returnDate,
          price: price ? String(price) : null,
          vehicle: String(vehicle),
          bookingUrl: bookingUrl
        });
      }

      // Stop after first origin-dest pair with results if it's a wildcard scan
      // (to avoid 10k requests — IndieCampers is city-pair-only)
      if (isWildOrigin && isWildDest && allOffers.length > 0) {
        return allOffers;
      }
    }
  }

  return allOffers;
}

// --- Imoova city name → ISO2 country code ---
const IMOOVA_COUNTRIES = {
  'Berlin': 'DE', 'Munich': 'DE', 'Hamburg': 'DE', 'Frankfurt': 'DE',
  'Cologne': 'DE', 'Stuttgart': 'DE', 'Dusseldorf': 'DE', 'Dresden': 'DE',
  'Hannover': 'DE', 'Leipzig': 'DE', 'Nuremberg': 'DE',
  'Paris': 'FR', 'Lyon': 'FR', 'Marseille': 'FR', 'Bordeaux': 'FR',
  'Toulouse': 'FR', 'Nice': 'FR', 'Nantes': 'FR', 'Strasbourg': 'FR',
  'Madrid': 'ES', 'Barcelona': 'ES', 'Seville': 'ES', 'Valencia': 'ES',
  'Bilbao': 'ES', 'Malaga': 'ES', 'Granada': 'ES', 'Zaragoza': 'ES',
  'Rome': 'IT', 'Milan': 'IT', 'Naples': 'IT', 'Florence': 'IT',
  'Venice': 'IT', 'Turin': 'IT', 'Bologna': 'IT', 'Palermo': 'IT',
  'Lisbon': 'PT', 'Porto': 'PT', 'Faro': 'PT',
  'Amsterdam': 'NL', 'Rotterdam': 'NL', 'Utrecht': 'NL',
  'Brussels': 'BE', 'Antwerp': 'BE', 'Ghent': 'BE',
  'Vienna': 'AT', 'Salzburg': 'AT', 'Graz': 'AT', 'Innsbruck': 'AT',
  'Zurich': 'CH', 'Geneva': 'CH', 'Bern': 'CH', 'Basel': 'CH',
  'London': 'GB', 'Edinburgh': 'GB', 'Manchester': 'GB', 'Bristol': 'GB',
  'Oslo': 'NO', 'Bergen': 'NO', 'Stavanger': 'NO',
  'Stockholm': 'SE', 'Gothenburg': 'SE', 'Malmo': 'SE',
  'Copenhagen': 'DK', 'Aarhus': 'DK',
  'Helsinki': 'FI', 'Tampere': 'FI',
  'Dublin': 'IE', 'Cork': 'IE',
  'Reykjavik': 'IS',
  'Warsaw': 'PL', 'Krakow': 'PL', 'Gdansk': 'PL',
  'Prague': 'CZ', 'Brno': 'CZ',
  'Budapest': 'HU',
  'Zagreb': 'HR', 'Split': 'HR', 'Dubrovnik': 'HR',
  'Athens': 'GR', 'Thessaloniki': 'GR',
  // Australia
  'Melbourne': 'AU', 'Sydney': 'AU', 'Brisbane': 'AU', 'Perth': 'AU',
  'Adelaide': 'AU', 'Cairns': 'AU', 'Darwin': 'AU', 'Broome': 'AU',
  // New Zealand
  'Auckland': 'NZ', 'Christchurch': 'NZ', 'Wellington': 'NZ', 'Queenstown': 'NZ',
  // Canada
  'Vancouver': 'CA', 'Toronto': 'CA', 'Calgary': 'CA', 'Edmonton': 'CA',
  'Montreal': 'CA', 'Ottawa': 'CA',
};

function fetchImoovaOffers_(route, window) {
  const isWildOrigin = isWildcardStation_(route.originId);
  const isWildDest = isWildcardStation_(route.destinationId);
  const originCountry = (route.originCountry || '').toUpperCase();
  const destCountry = (route.destinationCountry || '').toUpperCase();

  let gqlFilter = '';
  if (!isWildOrigin && (route.originId || route.originName)) {
    const slug = String(route.originId || route.originName || '').toLowerCase().trim();
    gqlFilter = ', whereDepartureCity: {column: SLUG, operator: EQ, value: "' + slug + '"}';
  }

  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
  const cacheKey = 'imoova:offers:v1:' + (gqlFilter ? Utilities.base64Encode(gqlFilter) : 'all');
  let res = null;
  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try { res = JSON.parse(cached); } catch (e) {}
    }
  }

  if (!res) {
    try {
      res = fetchJson_('https://api.imoova.com/graphql', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          query: 'query GetRelocations { relocations(first: 100' + gqlFilter + ') { data { id name available_from_date available_to_date hire_unit_rate retail_rate currency vehicle { name } departureCity { id name slug } deliveryCity { id name slug } } } }',
          operationName: 'GetRelocations'
        }),
        headers: { Origin: 'https://www.imoova.com' }
      });
      if (cache && res && res.data) {
        try { cache.put(cacheKey, JSON.stringify(res), 180); } catch (e) {}
      }
    } catch (e) {
      return [];
    }
  }

  const items = (res && res.data && res.data.relocations && Array.isArray(res.data.relocations.data)) ? res.data.relocations.data : [];
  const offers = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const dep = item.departureCity || {};
    const deliv = item.deliveryCity || {};

    const depCountry = IMOOVA_COUNTRIES[dep.name] || '';
    const delivCountry = IMOOVA_COUNTRIES[deliv.name] || '';

    // Apply country filters
    if (originCountry && depCountry && depCountry !== originCountry) continue;
    if (destCountry && delivCountry && delivCountry !== destCountry) continue;

    // Apply destination city filter if not wildcard
    if (!isWildDest && (route.destinationId || route.destinationName)) {
      const wantedDest = String(route.destinationId || route.destinationName || '').toLowerCase().trim();
      if (deliv.slug !== wantedDest && deliv.name.toLowerCase() !== wantedDest) continue;
    }

    const relId = item.id || ('im_' + i);
    const bookingUrl = 'https://www.imoova.com/relocations/deal/' + relId;
    const vehicleName = (item.vehicle && item.vehicle.name) || item.name || 'Imoova vehicle';
    const price = item.hire_unit_rate || item.retail_rate || null;

    offers.push({
      source: 'imoova',
      offerId: String(relId),
      origin: dep.name || '',
      originCountry: depCountry || originCountry,
      destination: deliv.name || '',
      destinationCountry: delivCountry || destCountry,
      pickupDate: item.available_from_date || (window && window.start) || '',
      returnDate: item.available_to_date || (window && window.end) || '',
      price: price ? String(price) : null,
      vehicle: String(vehicleName),
      bookingUrl: bookingUrl
    });
  }
  return offers;
}

