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

function buildDateWindow_(settings, filters) {
  const timezone = settings.timezone || DEFAULT_SETTINGS.timezone;
  const windowDays = Number(filters.window_days || settings.window_days || DEFAULT_SETTINGS.window_days);
  const pickupDate = parseIsoDate_(settings.pickup_date);
  const returnDate = parseIsoDate_(settings.return_date);

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

function offerMatchesFilter_(offer, filters, window) {
  const origins = parseCountryList_(filters.allowed_origin_countries);
  const destinations = parseCountryList_(filters.allowed_destination_countries);
  if (origins.length && offer.originCountry && origins.indexOf(offer.originCountry.toUpperCase()) === -1) {
    return false;
  }
  if (
    destinations.length &&
    offer.destinationCountry &&
    destinations.indexOf(offer.destinationCountry.toUpperCase()) === -1
  ) {
    return false;
  }

  const pickup = parseIsoDate_(offer.pickupDate);
  const dropoff = parseIsoDate_(offer.returnDate);

  if (pickup && (pickup < window.start || pickup > window.end)) {
    return false;
  }

  if (pickup && dropoff) {
    const durationDays = Math.round((dropoff.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24));
    const minDays = Number(filters.min_trip_days);
    const maxDays = Number(filters.max_trip_days);
    if (!isNaN(minDays) && minDays > 0 && durationDays < minDays) {
      return false;
    }
    if (!isNaN(maxDays) && maxDays > 0 && durationDays > maxDays) {
      return false;
    }
  }

  return true;
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
