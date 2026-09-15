// Web App (Telegram Mini App) UI. Entry point is doGet().

const WEBAPP_COUNTRIES = [
  ['DE', 'Германия'],
  ['AT', 'Австрия'],
  ['NL', 'Нидерланды'],
  ['BE', 'Бельгия'],
  ['FR', 'Франция'],
  ['CH', 'Швейцария'],
  ['ES', 'Испания'],
  ['IT', 'Италия'],
  ['PT', 'Португалия'],
  ['DK', 'Дания'],
  ['LU', 'Люксембург'],
  ['PL', 'Польша'],
  ['CZ', 'Чехия'],
  ['HR', 'Хорватия'],
  ['SI', 'Словения'],
  ['HU', 'Венгрия'],
];

const WEBAPP_INTERVALS = [1, 5, 10, 15, 30];

function doPost(e) {
  const secrets = getScriptSecrets();
  const expectedSecret = secrets.telegramWebhookSecret;
  const providedSecret =
    (e && e.parameter && (e.parameter.secret || e.parameter.secret_token)) ||
    (e && e.headers && (e.headers['x-telegram-bot-api-secret-token'] || e.headers['X-Telegram-Bot-Api-Secret-Token'])) ||
    '';

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return HtmlService.createHtmlOutput('Unauthorized');
  }

  return handleTelegramWebhook(e);
}

function doGet() {
  ensureTriggersFromWebApp_();
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Camper Monitor')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}

function ensureTriggersFromWebApp_() {
  try {
    const created = ensureMonitorTriggers_();
    if (created && created.length) {
      const props = PropertiesService.getScriptProperties();
      props.setProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_INSTALLED_AT, new Date().toISOString());
    }
  } catch (e) {}
}

function selfHealMonitorFromWebApp_(spreadsheet, settings) {
  try {
    const freshness = getMonitorFreshness_(spreadsheet, settings);
    if (!freshness.isStale) {
      return;
    }
    const created = ensureMonitorTriggers_();
    if (created && created.length) {
      const props = PropertiesService.getScriptProperties();
      props.setProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_INSTALLED_AT, new Date().toISOString());
    }
  } catch (e) {}
}

function ensureTriggersFromUi(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);
  const created = ensureMonitorTriggers_();
  if (created && created.length) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_INSTALLED_AT, new Date().toISOString());
  }
  return created || [];
}

function getUiData(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const spreadsheet = getSpreadsheet();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const filters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
  const routes = readRoutes_(spreadsheet);
  selfHealMonitorFromWebApp_(spreadsheet, settings);
  const dateWindow = buildDateWindow_(settings, filters);
  return {
    settings: {
      poll_interval_minutes: settings.poll_interval_minutes,
      window_days: settings.window_days,
      timezone: settings.timezone,
      telegram_enabled: settings.telegram_enabled,
    },
    filters: {
      allowed_origin_countries: parseCountryList_(filters.allowed_origin_countries),
      allowed_destination_countries: parseCountryList_(filters.allowed_destination_countries),
      min_trip_days: filters.min_trip_days || '',
      max_trip_days: filters.max_trip_days || '',
    },
    routes: routes,
    window: {
      start: formatIsoDate_(dateWindow.start),
      end: formatIsoDate_(dateWindow.end),
      days: dateWindow.windowDays,
    },
    status: buildStatus_(spreadsheet, settings),
    telegramReady: !!(secrets.telegramBotToken && secrets.telegramChatId),
    countries: WEBAPP_COUNTRIES,
    offersTabEnabled: !!secrets.webAppSkipAuth,
  };
}

function checkProvidersHealth(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const result = {
    roadsurfer: { ok: false, message: 'Проверка…' },
    movacar: { ok: false, message: 'Проверка…' },
    telegram: { ok: false, message: 'Не настроен' },
  };

  // 1. Roadsurfer
  try {
    const t0 = new Date().getTime();
    const rs = fetchJson_('https://booking.roadsurfer.com/api/en/rally/stations/6', {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-Alias': 'rally.fetchRoutes',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      retries: 0,
    });
    const ms = new Date().getTime() - t0;
    const routesCount = rs && Array.isArray(rs.returns)
      ? rs.returns.length
      : (rs && rs.routes ? rs.routes.length : (Array.isArray(rs) ? rs.length : 0));
    result.roadsurfer = { ok: true, message: 'Онлайн (' + routesCount + ' направлений, ' + ms + 'мс)' };
  } catch (e) {
    result.roadsurfer = { ok: false, message: 'Ошибка: ' + (e.message || String(e)).slice(0, 50) };
  }

  // 2. Movacar
  try {
    const t0 = new Date().getTime();
    const mv = fetchJson_(
      'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de&origin_reference=01JCRJ5NGV9E2YFNVSYKJR9W3J',
      {
        headers: {
          Accept: 'application/vnd.api+json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        retries: 0,
      }
    );
    const ms = new Date().getTime() - t0;
    const offersCount = mv && Array.isArray(mv.data) ? mv.data.length : 0;
    result.movacar = { ok: true, message: 'Онлайн (' + offersCount + ' слотов, ' + ms + 'мс)' };
  } catch (e) {
    result.movacar = { ok: false, message: 'Ошибка: ' + (e.message || String(e)).slice(0, 50) };
  }

  // 3. Telegram
  if (secrets.telegramBotToken && secrets.telegramChatId) {
    try {
      const t0 = new Date().getTime();
      const tg = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/getMe', { retries: 0 });
      const ms = new Date().getTime() - t0;
      if (tg && tg.ok && tg.result) {
        result.telegram = { ok: true, message: 'Онлайн (@' + (tg.result.username || 'bot') + ', ' + ms + 'мс)' };
      } else {
        result.telegram = { ok: false, message: 'Ошибка: ' + ((tg && tg.description) || 'не ок') };
      }
    } catch (e) {
      result.telegram = { ok: false, message: 'Ошибка: ' + (e.message || String(e)).slice(0, 50) };
    }
  }

  return result;
}

function getRoadsurferAllStations_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'roadsurfer:start-stations:v1';
  let stations = null;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { stations = JSON.parse(cached); } catch (e) {}
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
        name: station.name || station.city.name,
        country: String(station.city.country || '').trim().toUpperCase(),
      };
    });
    cache.put(cacheKey, JSON.stringify(stations), 21600);
  }
  return stations;
}

function getRoadsurferStations(countryCodes, initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const selectedCountries = (countryCodes || []).map(function (country) {
    return String(country || '').trim().toUpperCase();
  }).filter(Boolean);
  if (!selectedCountries.length) {
    return [];
  }

  const stations = getRoadsurferAllStations_();
  return stations.filter(function (station) {
    return selectedCountries.indexOf(String(station.country).toUpperCase()) !== -1;
  }).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
}

function getRoadsurferDestinations(originId, countryCodes, initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  if (!originId || !String(originId).trim()) {
    return [];
  }

  const cleanOriginId = String(originId).trim();
  const cache = CacheService.getScriptCache();
  const cacheKey = 'roadsurfer:destinations:v1:' + cleanOriginId;
  let returnIds = null;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { returnIds = JSON.parse(cached); } catch (e) {}
  }
  if (!returnIds) {
    const url = 'https://booking.roadsurfer.com/api/en/rally/stations/' + encodeURIComponent(cleanOriginId);
    const payload = fetchJson_(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-Alias': 'rally.fetchRoutes',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      retries: 1,
    });
    if (payload && Array.isArray(payload.returns)) {
      returnIds = payload.returns.map(String);
    } else if (payload && Array.isArray(payload.routes)) {
      returnIds = payload.routes.map(function (r) { return String(r.id || r.station_id); });
    } else if (Array.isArray(payload)) {
      returnIds = payload.map(function (r) { return String(r.id || r.station_id || r); });
    } else {
      returnIds = [];
    }
    cache.put(cacheKey, JSON.stringify(returnIds), 21600);
  }

  const allStations = getRoadsurferAllStations_();
  const stationMap = {};
  allStations.forEach(function (s) {
    stationMap[String(s.id)] = s;
  });

  const selectedCountries = (countryCodes || []).map(function (country) {
    return String(country || '').trim().toUpperCase();
  }).filter(Boolean);

  let destinations = returnIds.map(function (id) {
    const s = stationMap[String(id)];
    if (s) {
      return { id: s.id, name: s.name, country: s.country };
    }
    return { id: String(id), name: 'Station ' + id, country: '' };
  });

  if (selectedCountries.length > 0) {
    destinations = destinations.filter(function (d) {
      return selectedCountries.indexOf(String(d.country).toUpperCase()) !== -1;
    });
  }

  return destinations.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
}

function parseCountryList_(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (!raw) {
    return [];
  }
  return String(raw)
    .split(',')
    .map(function (c) {
      return c.trim().toUpperCase();
    })
    .filter(function (c) {
      return c.length > 0;
    });
}

function buildStatus_(spreadsheet, settings) {
  const interval = Number(settings.poll_interval_minutes) || Number(DEFAULT_SETTINGS.poll_interval_minutes);
  let lastRun = null;
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.RUNS);
  if (sheet && sheet.getLastRow() >= 2) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const values = sheet.getRange(sheet.getLastRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
    lastRun = {};
    headers.forEach(function (h, i) {
      lastRun[String(h)] = toClientValue_(values[i]);
    });
  }
  const freshness = getMonitorFreshness_(spreadsheet, settings);
  return {
    intervalMinutes: interval,
    lastRun: lastRun,
    freshness: freshness,
  };
}

function toClientValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return value.toISOString();
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

function saveUiData(payload, initData) {
  const rawInitData = initData || (payload && payload.initData) || '';
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(rawInitData, secrets);

  const spreadsheet = getSpreadsheet();
  if (payload.settings) {
    writeKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, payload.settings);
  }
  if (payload.filters) {
    const filters = Object.assign({}, payload.filters);
    if (Array.isArray(filters.allowed_origin_countries)) {
      filters.allowed_origin_countries = filters.allowed_origin_countries.join(',');
    }
    if (Array.isArray(filters.allowed_destination_countries)) {
      filters.allowed_destination_countries = filters.allowed_destination_countries.join(',');
    }
    writeKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, filters);
  }
  if (Array.isArray(payload.routes)) {
    saveRoutes_(spreadsheet, payload.routes);
  }
  return getUiData(rawInitData);
}

function runMonitorFromUi(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);
  return runMonitorOnce();
}

function authorizeWebAppRequest_(initData, secrets) {
  // During development, allow skipping auth via Script Property WEBAPP_SKIP_AUTH=1|true
  if (secrets.webAppSkipAuth) {
    return { authenticated: true, user: { id: 999, first_name: 'Dev', username: 'dev_user' } };
  }

  if (!initData || typeof initData !== 'string' || initData.trim() === '') {
    if (secrets.webAppRequireTelegramAuth) {
      throw new Error('Missing Telegram WebApp initData');
    }
    return { authenticated: false };
  }
  return validateTelegramWebAppData_(initData, secrets);
}

function validateTelegramWebAppData_(initData, secrets, nowSeconds) {
  if (!secrets) {
    secrets = getScriptSecrets();
  }
  if (!secrets.telegramBotToken) {
    throw new Error('Telegram Bot Token is not configured in Script Properties');
  }
  if (!initData || typeof initData !== 'string' || initData.trim() === '') {
    throw new Error('Missing Telegram WebApp initData');
  }

  const parts = initData.trim().split('&');
  const params = {};
  let providedHash = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const rawKey = part.substring(0, eqIdx);
    const rawVal = part.substring(eqIdx + 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    const val = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    if (key === 'hash') {
      providedHash = val;
    } else {
      params[key] = val;
    }
  }

  if (!providedHash) {
    throw new Error('Invalid Telegram WebApp initData: missing hash');
  }
  if (!params.auth_date) {
    throw new Error('Invalid Telegram WebApp initData: missing auth_date');
  }

  const authDate = parseInt(params.auth_date, 10);
  if (isNaN(authDate) || authDate <= 0) {
    throw new Error('Invalid Telegram WebApp initData: invalid auth_date');
  }

  const currentSeconds = nowSeconds !== undefined ? nowSeconds : Math.floor(Date.now() / 1000);
  const maxAgeSeconds = 86400;
  if (currentSeconds - authDate > maxAgeSeconds) {
    throw new Error('Telegram WebApp initData expired');
  }
  if (authDate > currentSeconds + 300) {
    throw new Error('Telegram WebApp initData auth_date is in the future');
  }

  const sortedKeys = Object.keys(params).sort();
  const dataCheckString = sortedKeys.map(function (k) {
    return k + '=' + params[k];
  }).join('\n');

  const secretKey = Utilities.computeHmacSha256Signature(secrets.telegramBotToken, 'WebAppData');
  const signatureBytes = Utilities.computeHmacSha256Signature(dataCheckString, secretKey);
  const calculatedHash = bytesToHex_(signatureBytes);

  if (calculatedHash.toLowerCase() !== providedHash.toLowerCase()) {
    throw new Error('Invalid Telegram WebApp initData signature');
  }

  let user = null;
  if (params.user) {
    try {
      user = JSON.parse(params.user);
    } catch (e) {
      throw new Error('Invalid Telegram WebApp initData: invalid user JSON');
    }
  }

  let chat = null;
  if (params.chat) {
    try {
      chat = JSON.parse(params.chat);
    } catch (e) {}
  }

  const allowedList = getAllowedTelegramIds_(secrets);
  if (allowedList.length === 0) {
    throw new Error('Access denied: No authorized Telegram users or chats configured.');
  }

  const userId = user && user.id != null ? String(user.id) : null;
  const username = user && user.username ? String(user.username).toLowerCase().replace(/^@/, '') : null;
  const chatId = chat && chat.id != null ? String(chat.id) : null;

  const isAllowed = allowedList.some(function (allowed) {
    return (userId && userId === allowed) ||
           (username && username === allowed) ||
           (chatId && chatId === allowed);
  });

  if (!isAllowed) {
    throw new Error('Access denied: Unauthorized Telegram user or chat.');
  }

  return {
    user: user,
    chat: chat,
    authDate: authDate,
    params: params,
  };
}

function bytesToHex_(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function getAllowedTelegramIds_(secrets) {
  const rawList = [secrets.telegramChatId, secrets.telegramAllowedUsers || ''].filter(Boolean).join(',');
  return rawList
    .split(',')
    .map(function (s) { return s.trim().toLowerCase().replace(/^@/, ''); })
    .filter(function (s) { return s.length > 0; });
}

function getOfferSources(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const sourceCol = ARCHIVE_HEADERS.indexOf('source');
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, ARCHIVE_HEADERS.length).getValues();
  const sources = {};
  values.forEach(function (row) {
    const src = String(row[sourceCol] || '').trim();
    if (src) { sources[src] = true; }
  });
  return Object.keys(sources).sort();
}

function getOffers(filter, initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  if (!sheet || sheet.getLastRow() < 2) {
    return { offers: [], total: 0, page: 1, totalPages: 0 };
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, ARCHIVE_HEADERS.length).getValues();
  const offers = values.map(function (row) {
    return {
      timestamp: row[0] ? new Date(row[0]).toISOString() : null,
      source: String(row[1] || ''),
      offerId: String(row[2] || ''),
      vehicleId: String(row[3] || ''),
      vehicle: String(row[4] || ''),
      origin: String(row[5] || ''),
      originCountry: String(row[6] || ''),
      destination: String(row[7] || ''),
      destinationCountry: String(row[8] || ''),
      pickupDate: String(row[9] || ''),
      returnDate: String(row[10] || ''),
      price: row[11],
      currency: String(row[12] || 'EUR'),
      bookingUrl: String(row[13] || ''),
      fingerprint: String(row[14] || ''),
      matches: row[15] === true || row[15] === 'true',
      telegramSentAt: row[16] ? String(row[16]) : null,
    };
  });

  // Apply filters
  let filtered = offers;
  if (filter) {
    if (filter.source) {
      filtered = filtered.filter(function (o) { return o.source === filter.source; });
    }
    if (filter.origin) {
      const originLower = filter.origin.toLowerCase();
      filtered = filtered.filter(function (o) {
        return o.origin.toLowerCase().includes(originLower) ||
               o.originCountry.toLowerCase() === originLower;
      });
    }
    if (filter.destination) {
      const destLower = filter.destination.toLowerCase();
      filtered = filtered.filter(function (o) {
        return o.destination.toLowerCase().includes(destLower) ||
               o.destinationCountry.toLowerCase() === destLower;
      });
    }
    if (filter.dateFrom) {
      const dateFrom = new Date(filter.dateFrom);
      filtered = filtered.filter(function (o) {
        if (!o.pickupDate) return true;
        return new Date(o.pickupDate) >= dateFrom;
      });
    }
    if (filter.dateTo) {
      const dateTo = new Date(filter.dateTo);
      filtered = filtered.filter(function (o) {
        if (!o.pickupDate) return true;
        return new Date(o.pickupDate) <= dateTo;
      });
    }
    if (filter.priceMin != null) {
      filtered = filtered.filter(function (o) { return o.price >= filter.priceMin; });
    }
    if (filter.priceMax != null) {
      filtered = filtered.filter(function (o) { return o.price <= filter.priceMax; });
    }
    if (filter.sentStatus === 'new') {
      filtered = filtered.filter(function (o) { return !o.telegramSentAt; });
    } else if (filter.sentStatus === 'sent') {
      filtered = filtered.filter(function (o) { return o.telegramSentAt; });
    }
  }

  // Sort by date descending, then by price
  filtered.sort(function (a, b) {
    if (a.pickupDate && b.pickupDate) {
      const dateA = new Date(a.pickupDate);
      const dateB = new Date(b.pickupDate);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateB.getTime() - dateA.getTime();
      }
    }
    return (a.price || 0) - (b.price || 0);
  });

  // Pagination
  const page = filter && filter.page ? Number(filter.page) : 1;
  const limit = filter && filter.limit ? Number(filter.limit) : 50;
  const offset = (page - 1) * limit;
  const paged = filtered.slice(offset, offset + limit);

  return {
    offers: paged,
    total: filtered.length,
    page: page,
    totalPages: Math.ceil(filtered.length / limit),
  };
}
