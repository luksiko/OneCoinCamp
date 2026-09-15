function fetchOffersForRoute_(route, window, filters) {
  if (route.source === 'roadsurfer') {
    return fetchRoadsurferOffers_(route, window, filters);
  }
  if (route.source === 'movacar') {
    return fetchMovacarOffers_(route, window);
  }
  throw new Error('Unknown source: ' + route.source);
}

function fetchRoadsurferOffers_(route, window, filters) {
  if (!route.originId) {
    throw new Error('Roadsurfer route needs origin_id');
  }
  if (!isRoadsurferStationId_(route.originId)) {
    throw new Error('Roadsurfer origin_id must be a numeric station ID, not a city name');
  }
  if (route.destinationId && !isRoadsurferStationId_(route.destinationId)) {
    throw new Error('Roadsurfer destination_id must be a numeric station ID, not a city name');
  }

  let destinations = [];
  if (route.destinationId) {
    destinations = [{ id: route.destinationId, name: route.destinationName || '', country: route.destinationCountry || '' }];
  } else {
    destinations = fetchRoadsurferDestinations_(route.originId, filters);
  }

  if (!destinations || destinations.length === 0) {
    return [];
  }

  const rangeStart = formatIsoDate_(window.start);
  const rangeEnd = formatIsoDate_(window.end);
  const allOffers = [];

  for (let i = 0; i < destinations.length; i++) {
    const dest = destinations[i];
    const refererUrl =
      'https://booking.roadsurfer.com/en/rally/pick?station=' +
      encodeURIComponent(route.originId) +
      '&end_station=' +
      encodeURIComponent(dest.id) +
      '&pickup_date=' +
      rangeStart +
      '&return_date=' +
      rangeEnd +
      '&currency=EUR';
    const searchUrl =
      'https://booking.roadsurfer.com/api/en/rally/search?stations=' +
      encodeURIComponent('[[' + route.originId + ',' + dest.id + ']]') +
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

    const items = Array.isArray(payload) ? payload : payload.results || payload.data || [];
    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const model = item.model || {};
      const price = firstDefined_(item.price, item.total_price, item.totalPrice, item.amount);
      const vehicle = item.name || model.name || '';
      const destName = dest.name || route.destinationName || ('Station ' + dest.id);
      
      const itemPickupDate = firstDefined_(item.pickup_date, item.pickupDate, rangeStart);
      const itemReturnDate = firstDefined_(item.return_date, item.returnDate, rangeEnd);
      
      const itemBookingUrl =
        'https://booking.roadsurfer.com/en/rally/pick?station=' +
        encodeURIComponent(route.originId) +
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
        origin: route.originName || 'Station ' + route.originId,
        originCountry: route.originCountry || '',
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

function fetchRoadsurferDestinations_(originId, filters) {
  const allowed = filters && filters.allowed_destination_countries
    ? parseCountryList_(filters.allowed_destination_countries)
    : ['IT', 'ES', 'PT', 'FR'];

  const url = 'https://booking.roadsurfer.com/api/en/rally/stations/' + encodeURIComponent(originId);
  const payload = fetchJson_(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-Alias': 'rally.fetchRoutes',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  const routes = Array.isArray(payload) ? payload : payload.routes || payload.data || [];
  if (Array.isArray(payload && payload.returns)) {
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

    return payload.returns.map(function (destinationId) {
      const s = stationMap && stationMap[String(destinationId)];
      return {
        id: destinationId,
        name: s ? s.name : 'Station ' + destinationId,
        country: s ? s.country : '',
      };
    }).filter(function (r) {
      const country = (r.country || '').toUpperCase().trim();
      if (!country || allowed.length === 0) return true;
      return allowed.indexOf(country) !== -1;
    });
  }
  return routes
    .filter(function (r) {
      const country = (r.country || r.destination_country || '').toUpperCase().trim();
      return allowed.length === 0 || allowed.indexOf(country) !== -1;
    })
    .map(function (r) {
      return {
        id: r.id || r.station_id,
        name: r.name || r.station_name || '',
        country: (r.country || r.destination_country || '').toUpperCase().trim(),
      };
    });
}

function isRoadsurferStationId_(value) {
  return /^\d+$/.test(String(value || '').trim());
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
