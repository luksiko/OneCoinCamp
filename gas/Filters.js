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

  if (filters && filters.max_price != null && filters.max_price !== '') {
    const maxPrice = Number(filters.max_price);
    if (!isNaN(maxPrice) && maxPrice >= 0 && offer.price != null && offer.price !== '') {
      if (Number(offer.price) > maxPrice) {
        return false;
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
