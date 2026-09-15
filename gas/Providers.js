function fetchOffersForRoute_(route, window, filters) {
  if (route.source === 'roadsurfer') {
    return fetchRoadsurferOffers_(route, window, filters);
  }
  if (route.source === 'movacar') {
    return fetchMovacarOffers_(route, window);
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
      cache.put(cacheKey, JSON.stringify(returnIds), 21600);
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

  // Country mode: resolve all origin stations in country
  const allStations = getRoadsurferAllStations_();
  const stationMap = {};
  allStations.forEach(function (s) {
    stationMap[String(s.id)] = s;
  });

  const targetOriginCountry = (route.originCountry || '').toUpperCase().trim();
  const originStations = allStations.filter(function (s) {
    if (!targetOriginCountry) return true;
    return String(s.country).toUpperCase().trim() === targetOriginCountry;
  });

  if (!originStations.length) {
    return [];
  }

  const targetDestCountry = (route.destinationCountry || '').toUpperCase().trim();
  const allowedDestCountries = targetDestCountry
    ? [targetDestCountry]
    : (filters && filters.allowed_destination_countries ? parseCountryList_(filters.allowed_destination_countries) : []);

  const specificDestId = !isWildDest && route.destinationId && isRoadsurferStationId_(route.destinationId)
    ? String(route.destinationId)
    : null;

  const pairs = [];
  for (let i = 0; i < originStations.length; i++) {
    const orig = originStations[i];
    const dests = fetchRoadsurferDestinations_(orig.id, filters);
    for (let j = 0; j < dests.length; j++) {
      const dest = dests[j];
      if (specificDestId && String(dest.id) !== specificDestId) {
        continue;
      }
      const destCountry = (dest.country || '').toUpperCase().trim();
      if (targetDestCountry && destCountry && destCountry !== targetDestCountry) {
        continue;
      }
      if (!targetDestCountry && allowedDestCountries.length && destCountry && allowedDestCountries.indexOf(destCountry) === -1) {
        continue;
      }
      pairs.push({
        origin: orig,
        destination: dest,
      });
    }
  }

  return pairs;
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

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const orig = pair.origin;
    const dest = pair.destination;

    const refererUrl =
      'https://booking.roadsurfer.com/en/rally/pick?station=' +
      encodeURIComponent(orig.id) +
      '&end_station=' +
      encodeURIComponent(dest.id) +
      '&pickup_date=' +
      rangeStart +
      '&return_date=' +
      rangeEnd +
      '&currency=EUR';
    const searchUrl =
      'https://booking.roadsurfer.com/api/en/rally/search?stations=' +
      encodeURIComponent('[[' + orig.id + ',' + dest.id + ']]') +
      '&range=' +
      encodeURIComponent(JSON.stringify([rangeStart, rangeEnd])) +
      '&currency=EUR&models=' +
      encodeURIComponent('[]');

    const payload = fetchJson_(searchUrl, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: refererUrl,
        'X-Requested-Alias': 'rally.search',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const items = Array.isArray(payload) ? payload : (payload && (payload.results || payload.data)) || [];
    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      if (item.available === false) {
        continue;
      }
      const model = item.model || {};
      const price = firstDefined_(item.price, item.total_price, item.totalPrice, item.amount);
      const vehicle = item.name || model.name || '';
      const destName = dest.name || route.destinationName || ('Station ' + dest.id);
      const origName = orig.name || route.originName || ('Station ' + orig.id);

      const itemPickupDate = firstDefined_(item.pickup_date, item.pickupDate, rangeStart);
      const itemReturnDate = firstDefined_(item.return_date, item.returnDate, rangeEnd);

      const itemBookingUrl =
        'https://booking.roadsurfer.com/en/rally/pick?station=' +
        encodeURIComponent(orig.id) +
        '&end_station=' +
        encodeURIComponent(dest.id) +
        '&pickup_date=' +
        itemPickupDate +
        '&return_date=' +
        itemReturnDate +
        '&currency=EUR';

      allOffers.push({
        source: 'roadsurfer',
        offerId: String(firstDefined_(item.id, item.offer_id, Utilities.getUuid())),
        vehicleId: String(firstDefined_(item.vehicle_id, model.id, '')),
        vehicle: vehicle,
        origin: origName,
        originCountry: orig.country || route.originCountry || '',
        destination: destName,
        destinationCountry: dest.country || route.destinationCountry || '',
        pickupDate: itemPickupDate,
        returnDate: itemReturnDate,
        price: price == null ? '' : Number(price),
        currency: 'EUR',
        bookingUrl: itemBookingUrl,
        rawJson: JSON.stringify(item),
      });
    }
  }

  return allOffers;
}

function fetchMovacarOffers_(route, window) {
  if (!route.originId || !route.destinationId) {
    return [];
  }
  const query =
    'locale=de&origin_reference=' +
    encodeURIComponent(route.originId) +
    '&destination_reference=' +
    encodeURIComponent(route.destinationId);
  const url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?' + query;
  const payload = fetchJson_(url, {
    headers: {
      Accept: 'application/vnd.api+json',
      Origin: 'https://movacar.com',
      Referer: 'https://movacar.com/',
      'X-Request-Id': randomRequestId_(),
    },
  });

  const included = payload.included || [];
  const destinationSummary = included.filter(function (item) {
    return item.type === 'locationsummary' && String(item.id) === String(route.destinationId);
  })[0];

  const offerCount =
    destinationSummary && destinationSummary.attributes ? destinationSummary.attributes.offer_count || 0 : 0;
  if (!offerCount) {
    return [];
  }

  return [
    {
      source: 'movacar',
      offerId: String(route.originId) + '->' + String(route.destinationId) + '@' + formatIsoDate_(window.start),
      vehicleId: '',
      vehicle: 'Movacar vehicle (' + offerCount + ' available)',
      origin: route.originName,
      originCountry: route.originCountry,
      destination: route.destinationName,
      destinationCountry: route.destinationCountry,
      pickupDate: formatIsoDate_(window.start),
      returnDate: formatIsoDate_(window.end),
      price: '',
      currency: 'EUR',
      bookingUrl: 'https://movacar.com/',
      rawJson: JSON.stringify(destinationSummary || payload),
    },
  ];
}

function firstDefined_() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
      return arguments[i];
    }
  }
  return undefined;
}
