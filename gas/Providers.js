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
    const url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?' + query;
    
    const payload = fetchJson_(url, {
      headers: {
        Accept: 'application/vnd.api+json',
        Origin: 'https://movacar.com',
        Referer: 'https://movacar.com/',
        'X-Request-Id': randomRequestId_()
      },
      retries: 1
    });
    
    const included = payload.included || [];

    for (let j = 0; j < included.length; j++) {
      const item = included[j];
      if (item.type === 'locationsummary' && item.attributes && item.attributes.location_type === 'destination') {
        const destReference = item.attributes.reference;
        const destName = item.attributes.name;
        const destCountry = MOVACAR_COUNTRIES[destName] || '';
        const offerCount = item.attributes.offer_count || 0;

        if (offerCount > 0) {
          if (!isWildDest) {
             if (String(destReference) !== String(destRef)) continue;
          } else if (route.destinationCountry && destCountry) {
             if (String(route.destinationCountry).toUpperCase() !== String(destCountry).toUpperCase()) continue;
          }

          foundOffers.push({
            source: 'movacar',
            offerId: String(origin.id) + '->' + String(destReference) + '@' + formatIsoDate_(window.start),
            vehicleId: '',
            vehicle: 'Movacar vehicle (' + offerCount + ' available)',
            origin: origin.name,
            originCountry: route.originCountry,
            destination: destName,
            destinationCountry: destCountry || route.destinationCountry,
            pickupDate: formatIsoDate_(window.start),
            returnDate: formatIsoDate_(window.end),
            price: 1,
            currency: 'EUR',
            bookingUrl: 'https://movacar.com/',
            rawJson: JSON.stringify(item)
          });
        }
      }
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
  const stations = [];
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
  return stations;
}

function fetchMovacarDestinations_(originRef, filters) {
  if (!originRef || originRef === '*' || originRef.toUpperCase() === 'ALL' || originRef.toUpperCase() === 'ANY') {
    return getMovacarAllStations_();
  }

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
  const destinations = [];
  const seen = {};
  
  const allowedCountries = (filters && filters.allowed_destination_countries)
    ? filters.allowed_destination_countries.split(',').map(function(c) { return c.trim().toUpperCase(); }).filter(Boolean)
    : [];

  for (let i = 0; i < included.length; i++) {
    const item = included[i];
    if (item.type === 'locationsummary' && item.attributes && item.attributes.location_type === 'destination') {
      const name = item.attributes.name;
      const id = item.attributes.reference;
      const cCode = MOVACAR_COUNTRIES[name] || '';
      
      if (allowedCountries.length > 0 && cCode) {
         if (allowedCountries.indexOf(cCode) === -1) {
           continue; // Skip if country is known and not in allowed list
         }
      }
      
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
  
  return destinations;
}

function fetchIndieCampersOffers_(route, window) {
  const origin = String(route.origin_id || route.origin || '').toLowerCase();
  const destination = String(route.destination_id || route.destination || '').toLowerCase();
  const pickupDate = (window && window.start) ? window.start : '2026-09-27';
  const returnDate = (window && window.end) ? window.end : '2026-10-07';

  const payload = {
    booking: {
      checkin_city: origin === '*' ? 'lisbon' : origin,
      checkout_city: destination === '*' ? 'porto' : destination,
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

  const res = fetchJson_('https://edge.indiecampers.com/api/v3/availability', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { Origin: 'https://indiecampers.com' }
  });

  const items = (res && res.data && Array.isArray(res.data.availability)) ? res.data.availability : [];
  const offers = [];
  const bookingUrl = 'https://indiecampers.com/rent-an-rv/search?from=' + origin + '&to=' + destination + '&start=' + pickupDate + '&end=' + returnDate;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.available === false) continue;
    const vanId = item.van_id || item.van_category || ('ic_' + i);
    const price = item.total_cost || item.daily_cost || null;
    const vehicle = item.manufacturer_name || item.van_category || 'Indie Camper';
    offers.push({
      source: 'indiecampers',
      offerId: String(vanId),
      origin: route.origin_name || route.origin || 'IndieCampers Origin',
      destination: route.destination_name || route.destination || 'IndieCampers Dest',
      pickupDate: item.checkin_date || pickupDate,
      returnDate: item.checkout_date || returnDate,
      price: price ? String(price) : null,
      vehicle: String(vehicle),
      bookingUrl: bookingUrl
    });
  }
  return offers;
}

function fetchImoovaOffers_(route, window) {
  const res = fetchJson_('https://api.imoova.com/graphql', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      query: 'query GetRelocations { relocations(first: 100) { data { id reference name type available_from_date available_to_date hire_unit_rate retail_rate currency vehicle { name } departureCity { id name slug } deliveryCity { id name slug } } } }',
      operationName: 'GetRelocations'
    }),
    headers: { Origin: 'https://www.imoova.com' }
  });

  const items = (res && res.data && res.data.relocations && Array.isArray(res.data.relocations.data)) ? res.data.relocations.data : [];
  const offers = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const dep = item.departureCity || {};
    const deliv = item.deliveryCity || {};

    const relId = item.id || ('im_' + i);
    const bookingUrl = 'https://www.imoova.com/relocations/deal/' + relId;
    const vehicleName = (item.vehicle && item.vehicle.name) || item.name || 'Imoova vehicle';
    const price = item.hire_unit_rate || item.retail_rate || null;

    offers.push({
      source: 'imoova',
      offerId: String(relId),
      origin: dep.name || route.origin || 'Imoova Origin',
      destination: deliv.name || route.destination || 'Imoova Dest',
      pickupDate: item.available_from_date || (window && window.start) || '2026-09-01',
      returnDate: item.available_to_date || (window && window.end) || '2026-09-15',
      price: price ? String(price) : null,
      vehicle: String(vehicleName),
      bookingUrl: bookingUrl
    });
  }
  return offers;
}

