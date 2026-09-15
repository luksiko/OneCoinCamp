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
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Camper Monitor')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}

function getUiData(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const spreadsheet = getSpreadsheet();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const filters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
  const routes = readRoutes_(spreadsheet);
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

function getRoadsurferStations(countryCodes, initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const selectedCountries = (countryCodes || []).map(function (country) {
    return String(country || '').trim().toUpperCase();
  }).filter(Boolean);
  if (!selectedCountries.length) {
    return [];
  }

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
      return { id: String(station.id), name: station.name || station.city.name, country: station.city.country };
    });
    cache.put(cacheKey, JSON.stringify(stations), 21600);
  }
  return stations.filter(function (station) {
    return selectedCountries.indexOf(String(station.country).toUpperCase()) !== -1;
  }).sort(function (a, b) {
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
  return {
    intervalMinutes: interval,
    lastRun: lastRun,
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
