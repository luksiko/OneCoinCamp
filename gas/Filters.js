function parseCountryList_(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return String(value || '')
    .split(',')
    .map(function (item) {
      return item.trim().toUpperCase();
    })
    .filter(Boolean);
}

function nextSunday_(timezone) {
  const now = new Date();
  const dayOfWeek = parseInt(Utilities.formatDate(now, timezone, 'u'), 10);
  const daysUntilSunday = dayOfWeek === 7 ? 0 : 7 - dayOfWeek;
  const sundayStr = Utilities.formatDate(
    new Date(now.getTime() + daysUntilSunday * 86400000),
    timezone,
    "yyyy-MM-dd"
  );
  return parseIsoDate_(sundayStr);
}

function addDays_(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseIsoDate_(value) {
  if (!value) {
    return null;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatIsoDate_(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function buildDateWindow_(settings, filters, pickupStr, returnStr) {
  const timezone = settings.timezone || DEFAULT_SETTINGS.timezone;
  const windowDays = Number(filters.window_days || settings.window_days || DEFAULT_SETTINGS.window_days);
  const pickupDate = parseIsoDate_(pickupStr);
  const returnDate = parseIsoDate_(returnStr);

  let start, end;
  if (pickupDate && returnDate) {
    start = pickupDate;
    end = returnDate;
  } else if (pickupDate) {
    start = pickupDate;
    end = addDays_(pickupDate, windowDays);
  } else {
    start = nextSunday_(timezone);
    end = addDays_(start, windowDays);
  }

  return {
    start: start,
    end: end,
    timezone: timezone,
    windowDays: Math.round((end.getTime() - start.getTime()) / 86400000),
  };
}

function buildNeighborWindows_(baseWindow, maxOffset) {
  var offsets = [];
  var offset = maxOffset || 2;
  for (var i = -offset; i <= offset; i++) {
    if (i === 0) continue;
    offsets.push({
      start: addDays_(baseWindow.start, i),
      end: addDays_(baseWindow.end, i),
      timezone: baseWindow.timezone,
      windowDays: baseWindow.windowDays,
      offset: i,
    });
  }
  return offsets;
}

function buildEffectiveWindow_(baseWindow, checkNeighbors) {
  if (!checkNeighbors || !baseWindow) {
    return baseWindow;
  }
  return {
    start: addDays_(baseWindow.start, -2),
    end: addDays_(baseWindow.end, 2),
    timezone: baseWindow.timezone,
    windowDays: baseWindow.windowDays,
    checkNeighbors: true,
  };
}

function offerMatchesFilter_(offer, filters, window, settings, matchedRoute) {
  if (!filters) return true;

  const meta = (typeof detectOfferVehicleMetadata_ === 'function')
    ? detectOfferVehicleMetadata_(offer)
    : { operator: offer.operator || 'Unknown', vehicleType: offer.vehicleType || 'camper' };

  // 1. Vehicle type filter (only_campers or vehicle_type or vehicle_types)
  // If matchedRoute is provided, route-level vehicle preference takes precedence (evaluated in routeMatchesOffer_).
  if (!matchedRoute) {
    const onlyCampers = filters.only_campers === true || filters.only_campers === 'true' || filters.only_campers === '1' || filters.vehicle_type === 'camper';
    if (onlyCampers && meta.vehicleType !== 'camper') {
      return false;
    }
    if (filters.vehicle_type && filters.vehicle_type !== 'all' && filters.vehicle_type !== '*' && filters.vehicle_type !== 'camper') {
      if (String(filters.vehicle_type).toLowerCase() !== String(meta.vehicleType).toLowerCase()) {
        return false;
      }
    }
    if (filters.vehicle_types) {
      let allowedTypes = [];
      if (Array.isArray(filters.vehicle_types)) {
        allowedTypes = filters.vehicle_types.map(function(s) { return String(s).trim().toLowerCase(); });
      } else if (typeof filters.vehicle_types === 'string') {
        allowedTypes = filters.vehicle_types.split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
      }
      if (allowedTypes.length > 0 && allowedTypes.indexOf(meta.vehicleType.toLowerCase()) === -1) {
        return false;
      }
    }
  }

  // 2. Operator filter (allowed_operators, excluded_operators, movacar_operators)
  if (filters.allowed_operators) {
    let allowedOps = [];
    if (Array.isArray(filters.allowed_operators)) {
      allowedOps = filters.allowed_operators.map(function(s) { return String(s).trim().toLowerCase(); });
    } else if (typeof filters.allowed_operators === 'string') {
      allowedOps = filters.allowed_operators.split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
    }
    if (allowedOps.length > 0 && allowedOps.indexOf(String(meta.operator || '').toLowerCase()) === -1) {
      return false;
    }
  }
  if (filters.excluded_operators) {
    let excludedOps = [];
    if (Array.isArray(filters.excluded_operators)) {
      excludedOps = filters.excluded_operators.map(function(s) { return String(s).trim().toLowerCase(); });
    } else if (typeof filters.excluded_operators === 'string') {
      excludedOps = filters.excluded_operators.split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
    }
    if (excludedOps.length > 0 && excludedOps.indexOf(String(meta.operator || '').toLowerCase()) !== -1) {
      return false;
    }
  }
  if (String(offer.source || '').toLowerCase() === 'movacar' && filters.movacar_operators) {
    let allowedMovacarOps = [];
    if (Array.isArray(filters.movacar_operators)) {
      allowedMovacarOps = filters.movacar_operators.map(function(s) { return String(s).trim().toLowerCase(); });
    } else if (typeof filters.movacar_operators === 'string') {
      allowedMovacarOps = filters.movacar_operators.split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
    }
    if (allowedMovacarOps.length > 0 && allowedMovacarOps.indexOf(String(meta.operator || '').toLowerCase()) === -1) {
      return false;
    }
  }

  if (!matchedRoute) {
    const origins = parseCountryList_(filters.allowed_origin_countries);
    const destinations = parseCountryList_(filters.allowed_destination_countries);
    
    if (origins.length > 0 && offer.originCountry && origins.indexOf(offer.originCountry.toUpperCase()) === -1) {
      return false;
    }
    if (destinations.length > 0 && offer.destinationCountry && destinations.indexOf(offer.destinationCountry.toUpperCase()) === -1) {
      return false;
    }
  }

  const pickup = parseIsoDate_(offer.pickupDate);
  const dropoff = parseIsoDate_(offer.returnDate);

  if (pickup) {
    if (window && window.start && window.end) {
      if (pickup < window.start || pickup > window.end) {
        return false;
      }
    } else if (matchedRoute && (matchedRoute.pickup_date || matchedRoute.pickupDate || matchedRoute.return_date || matchedRoute.returnDate)) {
      // Per-route dates already validated in routeMatchesOffer_
    } else {
      const windowDays = Number(filters.window_days);
      if (!isNaN(windowDays) && windowDays > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextSun = nextSunday_(settings && settings.timezone ? settings.timezone : DEFAULT_SETTINGS.timezone);
        const end = Math.max(
          addDays_(today, windowDays).getTime(),
          addDays_(nextSun, windowDays).getTime()
        );
        if (pickup.getTime() < today.getTime() || pickup.getTime() > end) {
          return false;
        }
      }
    }
  }

  if (pickup && dropoff) {
    const durationDays = Math.round((dropoff.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24));
    const minDays = Number(filters.min_trip_days != null ? filters.min_trip_days : filters.min_duration_days);
    const maxDays = Number(filters.max_trip_days != null ? filters.max_trip_days : filters.max_duration_days);
    if (!isNaN(minDays) && minDays > 0 && durationDays < minDays) {
      return false;
    }
    if (!isNaN(maxDays) && maxDays > 0 && durationDays > maxDays) {
      return false;
    }
  }

  const maxPrice = filters.max_price != null ? filters.max_price : filters.price_max;
  if (!offerPriceMatches_(offer, maxPrice)) {
    return false;
  }

  return true;
}

function offerPriceMatches_(offer, maxPriceSetting) {
  if (maxPriceSetting == null || maxPriceSetting === '') {
    return true;
  }
  const max = Number(maxPriceSetting);
  if (isNaN(max) || max < 0) {
    return true;
  }
  if (offer && offer.price != null && offer.price !== '') {
    const p = Number(offer.price);
    const total = (offer.totalPrice != null && offer.totalPrice !== '') ? Number(offer.totalPrice) : p;
    if (!isNaN(p)) {
      if (max <= 50) {
        return p <= max;
      } else {
        return (!isNaN(total) ? total <= max : p <= max);
      }
    }
  }
  return true;
}

function isSilentHoursActive_(settings, now) {
  if (!settings || !isTruthy_(settings.silent_hours_enabled)) {
    return false;
  }
  const startStr = String(settings.silent_hours_start || '23:00').trim();
  const endStr = String(settings.silent_hours_end || '07:00').trim();
  const startMatch = startStr.match(/^(\d{1,2}):(\d{2})$/);
  const endMatch = endStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!startMatch || !endMatch) {
    return false;
  }
  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  const timezone = settings.timezone || DEFAULT_SETTINGS.timezone;
  const nowDate = now || new Date();

  const currentHourStr = Utilities.formatDate(nowDate, timezone, 'HH');
  const currentMinStr = Utilities.formatDate(nowDate, timezone, 'mm');
  const currentMinutes = Number(currentHourStr) * 60 + Number(currentMinStr);

  if (startMinutes === endMinutes) {
    return false;
  }
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function offerFingerprint_(offer) {
  const raw = [
    offer.source || '',
    offer.offerId || '',
    offer.origin || '',
    offer.destination || '',
    offer.pickupDate || '',
    offer.returnDate || '',
    offer.price == null ? '' : String(offer.price),
  ].join('|');
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return signature
    .map(function (byte) {
      const positive = (byte + 256) % 256;
      return positive.toString(16).padStart(2, '0');
    })
    .join('');
}

function matchesFirestoreFilter_(offer, filters, settings, matchedRoute) {
  return offerMatchesFilter_(offer, filters, null, settings, matchedRoute);
}

function routeMatchesOffer_(route, offer) {
  if (!route || !route.enabled || !offer) return false;
  if (String(route.source || '').toLowerCase().trim() !== String(offer.source || '').toLowerCase().trim()) return false;

  // 0. Vehicle type check per route: 'all' | 'camper' | 'car' (defaults to 'all' if ignored or empty)
  const rVType = String(route.vehicle_type || route.vehicleType || 'all').toLowerCase().trim();
  if (rVType && rVType !== 'all' && rVType !== '*' && rVType !== 'any') {
    const meta = (typeof detectOfferVehicleMetadata_ === 'function')
      ? detectOfferVehicleMetadata_(offer)
      : { operator: offer.operator || 'Unknown', vehicleType: offer.vehicleType || 'camper' };
    const offerVType = String(meta.vehicleType || offer.vehicleType || 'camper').toLowerCase().trim();
    if (rVType === 'camper' && offerVType !== 'camper') return false;
    if (rVType === 'car' && offerVType !== 'car') return false;
    if (rVType !== 'camper' && rVType !== 'car' && rVType !== offerVType) return false;
  }

  // 1. Country checks
  const rOrigCountry = String(route.origin_country || route.originCountry || '').trim().toUpperCase();
  if (rOrigCountry && rOrigCountry !== '*' && rOrigCountry !== 'ANY' && rOrigCountry !== 'ALL' && offer.originCountry) {
    if (rOrigCountry !== String(offer.originCountry).trim().toUpperCase()) return false;
  }
  const rDestCountry = String(route.destination_country || route.destinationCountry || '').trim().toUpperCase();
  if (rDestCountry && rDestCountry !== '*' && rDestCountry !== 'ANY' && rDestCountry !== 'ALL' && offer.destinationCountry) {
    if (rDestCountry !== String(offer.destinationCountry).trim().toUpperCase()) return false;
  }

  // 2. City / Station checks
  function matchLoc_(routeLoc, offerLoc, routeId, offerId) {
    if (routeId && (String(routeId).trim() === '*' || String(routeId).trim().toUpperCase() === 'ALL' || String(routeId).trim().toUpperCase() === 'ANY')) return true;
    const rLoc = String(routeLoc || '').trim();
    if (!rLoc || rLoc === '*' || rLoc.toUpperCase() === 'ALL' || rLoc.toUpperCase() === 'ANY' || (typeof isWildcardCityName_ === 'function' ? isWildcardCityName_(rLoc) : rLoc === 'Все города')) return true;
    if (routeId && offerId && String(routeId).trim() === String(offerId).trim()) return true;
    if (offerLoc && rLoc.toLowerCase() === String(offerLoc).trim().toLowerCase()) return true;
    return false;
  }

  const origMatch = matchLoc_(route.origin_name || route.originName, offer.origin, route.origin_id || route.originId, offer.originId);
  const destMatch = matchLoc_(route.destination_name || route.destinationName, offer.destination, route.destination_id || route.destinationId, offer.destinationId);
  if (!origMatch || !destMatch) return false;

  // 3. Date window check if route specified pickup_date or return_date
  const rPickup = parseIsoDate_(route.pickup_date || route.pickupDate);
  const rReturn = parseIsoDate_(route.return_date || route.returnDate);
  const offerPickup = parseIsoDate_(offer.pickupDate);
  if (offerPickup) {
    if (rPickup && offerPickup < rPickup) return false;
    if (rReturn && offerPickup > rReturn) return false;
  }

  return true;
}
