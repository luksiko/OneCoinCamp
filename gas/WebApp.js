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
  if (e && e.parameter && e.parameter.api === '1') {
    return handleApiRequest_(e);
  }

  const secrets = getScriptSecrets();
  const expectedSecret = secrets.telegramWebhookSecret;
  if (expectedSecret && e && e.parameter && (e.parameter.secret || e.parameter.secret_token)) {
    const provided = e.parameter.secret || e.parameter.secret_token;
    if (provided !== expectedSecret) {
      return HtmlService.createHtmlOutput('Unauthorized');
    }
  }

  return handleTelegramWebhook(e);
}

function handleApiRequest_(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const method = body.method;
    const args = body.args || [];
    
    // Explicitly list allowed frontend methods for security
    const allowedMethods = [
      'getUiData',
      'checkProvidersHealth',
      'getRoadsurferStations',
      'getRoadsurferDestinations',
      'saveUiData',
      'runMonitorFromUi',
      'ensureTriggersFromUi',
      'getOfferSources',
      'getOffers',
      'deleteOffer',
      'checkOffersAvailabilityWeb',
      'getAnalytics',
      'registerTelegramWebhookWeb',
      'deleteTelegramWebhookWeb',
      'migrateMovacarArchiveUrls'
    ];
    
    if (allowedMethods.indexOf(method) === -1) {
      throw new Error("Method not allowed or not found: " + method);
    }
    
    // Call the corresponding function dynamically
    // `this[method]` works because top-level functions are properties of `this` in Apps Script
    const result = this[method].apply(this, args);
    
    return ContentService.createTextOutput(JSON.stringify({ result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message || String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


function doGet(e) {
  if (e && e.parameter && e.parameter.debug === 'runs') {
    try {
      const sheet = getSpreadsheet().getSheetByName('Routes');
      const data = sheet.getDataRange().getValues().filter(row => row[0] === true);
      return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(err.toString());
    }
  }
  ensureTriggersFromWebApp_();
  return ContentService.createTextOutput("This web app UI has been moved to GitHub Pages.")
    .setMimeType(ContentService.MimeType.TEXT);
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
  const auth = authorizeWebAppRequest_(initData, secrets);
  let userId = auth.user ? auth.user.id : null;
  if (!userId && secrets.telegramChatId) {
    userId = secrets.telegramChatId;
  }

  const spreadsheet = getSpreadsheet();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  
  let filters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
  let routes = readRoutes_(spreadsheet);
  
  if (userId && typeof upsertUser === 'function') {
    try {
      upsertUser(userId, auth.chat ? auth.chat.id : userId, { username: (auth.user && auth.user.username) || '' });
    } catch (e) {}
    try {
      const userFilters = (typeof getUserFilters === 'function') ? getUserFilters(userId) : null;
      if (userFilters && Object.keys(userFilters).length > 0) {
        if (userFilters.allowed_origin_countries !== undefined && userFilters.allowed_origin_countries !== null && userFilters.allowed_origin_countries !== '') {
          filters.allowed_origin_countries = userFilters.allowed_origin_countries;
        }
        if (userFilters.allowed_destination_countries !== undefined && userFilters.allowed_destination_countries !== null && userFilters.allowed_destination_countries !== '') {
          filters.allowed_destination_countries = userFilters.allowed_destination_countries;
        }
        if (userFilters.min_duration_days !== undefined && userFilters.min_duration_days !== null && userFilters.min_duration_days !== '') {
          filters.min_trip_days = userFilters.min_duration_days;
        } else if (userFilters.min_duration_days === null) {
          filters.min_trip_days = '';
        }
        if (userFilters.max_duration_days !== undefined && userFilters.max_duration_days !== null && userFilters.max_duration_days !== '') {
          filters.max_trip_days = userFilters.max_duration_days;
        } else if (userFilters.max_duration_days === null) {
          filters.max_trip_days = '';
        }
        if (userFilters.price_max !== undefined && userFilters.price_max !== null && userFilters.price_max !== '') {
          filters.max_price = userFilters.price_max;
        } else if (userFilters.price_max === null) {
          filters.max_price = '';
        }
      }
    } catch (e) {}
    try {
      const uRoutes = (typeof getUserRoutes === 'function') ? getUserRoutes(userId) : null;
      if (uRoutes && uRoutes.length > 0) {
        routes = uRoutes;
      }
    } catch (e) {}
  }
  selfHealMonitorFromWebApp_(spreadsheet, settings);
  const dateWindow = buildDateWindow_(settings, filters, settings.pickup_date, settings.return_date);
  return {
    settings: {
      poll_interval_minutes: settings.poll_interval_minutes,
      window_days: settings.window_days,
      check_neighbors: isTruthy_(settings.check_neighbors),
      timezone: settings.timezone,
      telegram_enabled: settings.telegram_enabled,
      notify_all_by_price: isTruthy_(settings.notify_all_by_price),
      silent_hours_enabled: isTruthy_(settings.silent_hours_enabled),
      silent_hours_start: String(settings.silent_hours_start || '23:00').trim(),
      silent_hours_end: String(settings.silent_hours_end || '07:00').trim(),
      provider_roadsurfer_enabled: isProviderEnabled_('roadsurfer', settings),
      provider_movacar_enabled: isProviderEnabled_('movacar', settings),
      provider_indiecampers_enabled: isProviderEnabled_('indiecampers', settings),
      provider_imoova_enabled: isProviderEnabled_('imoova', settings),
    },
    filters: {
      allowed_origin_countries: parseCountryList_(filters.allowed_origin_countries),
      allowed_destination_countries: parseCountryList_(filters.allowed_destination_countries),
      min_trip_days: filters.min_trip_days || '',
      max_trip_days: filters.max_trip_days || '',
      max_price: filters.max_price != null ? filters.max_price : '',
    },
    routes: routes.map(function(r) {
      var w = buildDateWindow_(settings, filters, r.pickupDate || settings.pickup_date, r.returnDate || settings.return_date);
      r.window = {
        start: formatIsoDate_(w.start),
        end: formatIsoDate_(w.end),
        days: w.windowDays,
      };
      return r;
    }),
    window: {
      start: formatIsoDate_(dateWindow.start),
      end: formatIsoDate_(dateWindow.end),
      days: dateWindow.windowDays,
    },
    status: buildStatus_(spreadsheet, settings),
    monitorError: PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.MONITOR_LAST_ERROR) || '',
    telegramReady: !!(secrets.telegramBotToken && secrets.telegramChatId),
    telegramMode: (typeof isTelegramWebhookActive_ === 'function' && isTelegramWebhookActive_()) ? 'webhook' : 'polling',
    telegramWebhookActive: typeof isTelegramWebhookActive_ === 'function' && isTelegramWebhookActive_(),
    countries: WEBAPP_COUNTRIES,
    offersTabEnabled: true,
    supportedProviders: (typeof SUPPORTED_PROVIDERS !== 'undefined') ? SUPPORTED_PROVIDERS : [],
  };
}

function checkProvidersHealth(initData, forceRefresh) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const spreadsheet = getSpreadsheet();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);

  const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
  const cacheKey = 'webapp:providers-health:v1';
  if (!forceRefresh && cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
  }

  const result = {
    roadsurfer: { ok: false, message: 'Проверка…' },
    movacar: { ok: false, message: 'Проверка…' },
    indiecampers: { ok: false, message: 'Проверка…' },
    imoova: { ok: false, message: 'Проверка…' },
    telegram: { ok: false, message: 'Не настроен' },
  };

  // 1. Roadsurfer
  if (!isProviderEnabled_('roadsurfer', settings)) {
    result.roadsurfer = { ok: false, message: 'Отключен в настройках', disabled: true };
  } else {
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
  }

  // 2. Movacar
  if (!isProviderEnabled_('movacar', settings)) {
    result.movacar = { ok: false, message: 'Отключен в настройках', disabled: true };
  } else {
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
  }

  // 3. Indie Campers
  if (!isProviderEnabled_('indiecampers', settings)) {
    result.indiecampers = { ok: false, message: 'Отключен в настройках', disabled: true };
  } else {
    try {
      const t0 = new Date().getTime();
      const ic = fetchJson_('https://edge.indiecampers.com/api/v3/availability', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          booking: { checkin_city: 'lisbon', checkout_city: 'porto', checkin_datetime: '2026-09-27T16:30:00+00:00', checkout_datetime: '2026-10-07T11:00:00+00:00', locale: 'en', legacy_search: false, van_category: '', limit: 20, offset: 0, only_marketplace: false },
          filters: {},
          meta: { current_route: 'rent-an-rv-search' }
        }),
        headers: { Origin: 'https://indiecampers.com' },
        retries: 0
      });
      const ms = new Date().getTime() - t0;
      const count = ic && ic.data && Array.isArray(ic.data.availability) ? ic.data.availability.length : 0;
      result.indiecampers = { ok: true, message: 'Онлайн (' + count + ' слотов, ' + ms + 'мс)' };
    } catch (e) {
      result.indiecampers = { ok: false, message: 'Ошибка: ' + (e.message || String(e)).slice(0, 50) };
    }
  }

  // 4. Imoova
  if (!isProviderEnabled_('imoova', settings)) {
    result.imoova = { ok: false, message: 'Отключен в настройках', disabled: true };
  } else {
    try {
      const t0 = new Date().getTime();
      const im = fetchJson_('https://api.imoova.com/graphql', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          query: 'query GetRelocations { relocations(first: 100) { data { id } } }',
          operationName: 'GetRelocations'
        }),
        headers: { Origin: 'https://www.imoova.com' },
        retries: 0
      });
      const ms = new Date().getTime() - t0;
      const count = im && im.data && im.data.relocations && Array.isArray(im.data.relocations.data) ? im.data.relocations.data.length : 0;
      result.imoova = { ok: true, message: 'Онлайн (' + count + ' слотов, ' + ms + 'мс)' };
    } catch (e) {
      result.imoova = { ok: false, message: 'Ошибка: ' + (e.message || String(e)).slice(0, 50) };
    }
  }

  // 5. Telegram
  if (secrets.telegramBotToken && secrets.telegramChatId) {
    try {
      const t0 = new Date().getTime();
      const tg = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/getMe', { retries: 0 });
      const ms = new Date().getTime() - t0;
      if (tg && tg.ok && tg.result) {
        const modeLabel = (typeof isTelegramWebhookActive_ === 'function' && isTelegramWebhookActive_()) ? 'Webhook' : 'Polling';
        result.telegram = { ok: true, message: 'Онлайн (@' + (tg.result.username || 'bot') + ', ' + modeLabel + ', ' + ms + 'мс)' };
      } else {
        result.telegram = { ok: false, message: 'Ошибка: ' + ((tg && tg.description) || 'не ок') };
      }
    } catch (e) {
      result.telegram = { ok: false, message: 'Ошибка: ' + (e.message || String(e)).slice(0, 50) };
    }
  }

  if (cache) {
    try {
      cache.put(cacheKey, JSON.stringify(result), 180);
    } catch (e) {}
  }

  return result;
}

function registerTelegramWebhookWeb(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);
  if (typeof registerTelegramWebhookCore_ === 'function') {
    return registerTelegramWebhookCore_();
  }
  return { ok: false, message: 'registerTelegramWebhookCore_ is not defined' };
}

function deleteTelegramWebhookWeb(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);
  if (typeof deleteTelegramWebhookCore_ === 'function') {
    return deleteTelegramWebhookCore_();
  }
  return { ok: false, message: 'deleteTelegramWebhookCore_ is not defined' };
}

function getProviderStations(provider, countryCodes, initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const selectedCountries = (countryCodes || []).map(function (country) {
    return String(country || '').trim().toUpperCase();
  }).filter(Boolean);
  if (!selectedCountries.length) {
    return [];
  }

  let stations = [];
  if (provider === 'movacar') {
    stations = getMovacarAllStations_();
  } else if (provider === 'roadsurfer') {
    stations = getRoadsurferAllStations_();
  } else if (provider === 'indiecampers') {
    stations = getIndieCampersAllStations_();
  } else if (provider === 'imoova') {
    // Imoova has no city listing API - return wildcard only
    return [{ id: '*', name: '✨ Все города / Любой', country: '' }];
  } else {
    stations = [{ id: '*', name: '✨ Все города / Любой', country: '' }];
  }
  return stations.filter(function (station) {
    return !station.country || selectedCountries.indexOf(String(station.country).toUpperCase()) !== -1;
  }).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
}


function getProviderDestinations(provider, originId, countryCodes, initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const cleanOriginId = String(originId || '').trim();
  if (!cleanOriginId) {
    return [];
  }

  const selectedCountries = (countryCodes || []).map(function (country) {
    return String(country || '').trim().toUpperCase();
  }).filter(Boolean);

  if (cleanOriginId === '*' || cleanOriginId.toUpperCase() === 'ALL' || cleanOriginId.toUpperCase() === 'ANY') {
    let allStations = [];
    if (provider === 'movacar') allStations = getMovacarAllStations_();
    else if (provider === 'indiecampers') allStations = getIndieCampersAllStations_();
    else if (provider === 'imoova') return [{ id: '*', name: '✨ Все города / Любой', country: '' }];
    else allStations = getRoadsurferAllStations_();

    return allStations.filter(function (s) {
      if (!selectedCountries.length) return true;
      return !s.country || selectedCountries.indexOf(String(s.country).toUpperCase()) !== -1;
    }).map(function (s) {
      return { id: String(s.id), name: s.name, country: s.country };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  let destinations = [];
  if (provider === 'movacar') {
    destinations = fetchMovacarDestinations_(cleanOriginId, { allowed_destination_countries: selectedCountries.join(',') });
  } else if (provider === 'indiecampers') {
    destinations = getIndieCampersAllStations_().filter(function(s) {
      return s.id !== cleanOriginId &&
        (!selectedCountries.length || selectedCountries.indexOf(s.country) !== -1);
    });
  } else if (provider === 'imoova') {
    return [{ id: '*', name: '✨ Все города / Любой', country: '' }];
  } else {
    destinations = fetchRoadsurferDestinations_(cleanOriginId, { allowed_destination_countries: selectedCountries.join(',') });
  }

  return destinations.map(function (d) {
    return {
      id: String(d.id),
      name: d.name,
      country: d.country,
    };
  }).sort(function (a, b) {
    return a.name.localeCompare(b.name);
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
  const auth = authorizeWebAppRequest_(rawInitData, secrets);
  let userId = auth.user ? auth.user.id : null;
  if (!userId && secrets.telegramChatId) {
    userId = secrets.telegramChatId;
  }

  const spreadsheet = getSpreadsheet();
  const isAdmin = Boolean(secrets.webAppSkipAuth || !secrets.telegramChatId || (userId && (String(userId) === String(secrets.telegramChatId) || (secrets.telegramAllowedUsers && secrets.telegramAllowedUsers.indexOf(userId) !== -1))));
  if (payload.settings && isAdmin) {
    const currentSettings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
    const mergedSettings = Object.assign({}, currentSettings, payload.settings);
    writeKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, mergedSettings);
  }
  if (payload.filters) {
    if (userId && typeof setUserFilters === 'function') {
      try {
        const f = payload.filters;
        const current = (typeof getUserFilters === 'function' ? getUserFilters(userId) : {}) || {};
        const toSave = {
          allowed_origin_countries: Array.isArray(f.allowed_origin_countries) ? f.allowed_origin_countries : (f.allowed_origin_countries ? String(f.allowed_origin_countries).split(',').map(function(s) { return s.trim().toUpperCase(); }) : []),
          allowed_destination_countries: Array.isArray(f.allowed_destination_countries) ? f.allowed_destination_countries : (f.allowed_destination_countries ? String(f.allowed_destination_countries).split(',').map(function(s) { return s.trim().toUpperCase(); }) : []),
          min_duration_days: f.min_trip_days ? Number(f.min_trip_days) : null,
          max_duration_days: f.max_trip_days ? Number(f.max_trip_days) : null,
          price_max: f.max_price != null && f.max_price !== '' ? Number(f.max_price) : null,
          window_days: current.window_days || Number(DEFAULT_SETTINGS.window_days) || 14,
          window_start_rule: current.window_start_rule || 'today',
          roadsurfer_origins_per_run: current.roadsurfer_origins_per_run || 15,
        };
        if (current.silent_hours) toSave.silent_hours = current.silent_hours;
        setUserFilters(userId, toSave);
      } catch (e) {
        console.error('Error saving user filters: ' + (e && e.message));
      }
    }
    if (isAdmin || !userId || typeof setUserFilters !== 'function') {
      const currentFilters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
      const mergedFilters = Object.assign({}, currentFilters, payload.filters);
      writeKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, mergedFilters);
    }
  }
  if (Array.isArray(payload.routes)) {
    if (userId && typeof addUserRoute === 'function') {
      try {
        if (typeof clearUserCache === 'function') clearUserCache(userId);
        const oldRoutes = (typeof getUserRoutes === 'function' ? getUserRoutes(userId) : []) || [];
        if (typeof firestoreDelete === 'function') {
          oldRoutes.forEach(function(r) { if (r && r._id) firestoreDelete('users/' + userId + '/routes/' + r._id); });
        }
        payload.routes.forEach(function(r) { 
          delete r._id; 
          delete r.window;
          addUserRoute(userId, r); 
        });
      } catch (e) {
        console.error('Error saving user routes: ' + (e && e.message));
      }
    }
    if (isAdmin || !userId || typeof addUserRoute !== 'function') {
      saveRoutes_(spreadsheet, payload.routes);
    }
  }
  try {
    const cache = typeof CacheService !== 'undefined' && CacheService.getScriptCache ? CacheService.getScriptCache() : null;
    if (cache) {
      cache.remove('webapp:providers-health:v1');
    }
  } catch (e) {}
  return getUiData(initData);
}

function runMonitorFromUi(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);
  return runMonitorOnce();
}

function extractUserFromInitData_(initData) {
  if (!initData || typeof initData !== 'string') return null;
  try {
    const parts = initData.trim().split('&');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.indexOf('user=') === 0) {
        const rawVal = decodeURIComponent(part.substring(5).replace(/\+/g, ' '));
        return JSON.parse(rawVal);
      }
    }
  } catch (e) {}
  return null;
}

function authorizeWebAppRequest_(initData, secrets) {
  // 1. If Telegram initData is provided, always authenticate as the real Telegram user!
  if (initData && typeof initData === 'string' && initData.trim() !== '') {
    try {
      return validateTelegramWebAppData_(initData, secrets);
    } catch (e) {
      if (secrets && secrets.webAppSkipAuth) {
        const parsedUser = extractUserFromInitData_(initData);
        if (parsedUser && parsedUser.id) {
          return { authenticated: true, user: parsedUser };
        }
      }
      throw e;
    }
  }

  // 2. Only during development without initData, allow skipping auth
  if (secrets && secrets.webAppSkipAuth) {
    const devId = secrets.telegramChatId ? (Number(secrets.telegramChatId) || secrets.telegramChatId) : 999;
    return { authenticated: true, user: { id: devId, first_name: 'Dev', username: 'dev_user' } };
  }

  if (!initData || typeof initData !== 'string' || initData.trim() === '') {
    if (secrets && secrets.webAppRequireTelegramAuth) {
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
  
  const userId = user && user.id != null ? String(user.id) : null;
  const username = user && user.username ? String(user.username).toLowerCase().replace(/^@/, '') : null;
  const chatId = chat && chat.id != null ? String(chat.id) : null;

  const isAllowed = secrets.webAppSkipAuth || allowedList.length === 0 || allowedList.some(function (allowed) {
    return allowed === '*' ||
           (userId && userId === allowed) ||
           (username && username === allowed) ||
           (chatId && chatId === allowed);
  });

  // В многопользовательской версии любой юзер с валидной подписью Telegram имеет доступ к своим данным.
  // Оставляем проверку isAllowed только если явно не передан webAppSkipAuth и есть список.
  if (!isAllowed && !secrets.webAppSkipAuth) {
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
  let needSheetUpdate = false;
  const offers = values.map(function (row) {
    let bookingUrl = String(row[13] || '');
    const source = String(row[1] || '').toLowerCase();
    if (source === 'movacar') {
      if (!bookingUrl || bookingUrl === 'https://movacar.com/' || bookingUrl === 'https://movacar.com' || bookingUrl.indexOf('origin=') === -1) {
        const origin = String(row[5] || '').trim();
        const dest = String(row[7] || '').trim();
        const params = [];
        if (origin) params.push('origin=' + encodeURIComponent(origin));
        if (dest && dest !== 'Unknown') params.push('destination=' + encodeURIComponent(dest));
        const newUrl = params.length > 0 ? ('https://www.movacar.com/offers?' + params.join('&')) : 'https://www.movacar.com/offers';
        if (newUrl !== bookingUrl) {
          bookingUrl = newUrl;
          row[13] = newUrl;
          needSheetUpdate = true;
        }
      }
    }
    const tz = (spreadsheet && spreadsheet.getSpreadsheetTimeZone) ? spreadsheet.getSpreadsheetTimeZone() : (typeof Session !== 'undefined' && Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'Europe/Berlin');
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
      pickupDate: formatArchiveDate_(row[9], tz),
      returnDate: formatArchiveDate_(row[10], tz),
      price: row[11],
      currency: String(row[12] || 'EUR'),
      bookingUrl: bookingUrl,
      fingerprint: String(row[14] || ''),
      matches: row[15] === true || row[15] === 'true',
      telegramSentAt: row[16] ? String(row[16]) : null,
    };
  });

  if (needSheetUpdate) {
    try {
      sheet.getRange(2, 1, values.length, ARCHIVE_HEADERS.length).setValues(values);
    } catch (e) {}
  }

  // Collect available sources from all offers
  const availableSourcesMap = {};
  offers.forEach(function (o) {
    const s = String(o.source || '').trim().toLowerCase();
    if (s) { availableSourcesMap[s] = true; }
  });
  const availableSources = Object.keys(availableSourcesMap).sort();

  // Apply filters
  let filtered = offers;
  if (filter) {
    if (filter.source) {
      filtered = filtered.filter(function (o) { return o.source.toLowerCase() === filter.source.toLowerCase(); });
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
    if (filter.isMatched === true || filter.isMatched === 'true') {
      filtered = filtered.filter(function (o) { return o.matches; });
    }
  }

  // Sort by added timestamp descending (newest offers first), then by pickupDate, then by price
  filtered.sort(function (a, b) {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    if (a.pickupDate && b.pickupDate) {
      const dateA = new Date(a.pickupDate).getTime() || 0;
      const dateB = new Date(b.pickupDate).getTime() || 0;
      if (dateA !== dateB) {
        return dateA - dateB;
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
    availableSources: availableSources,
  };
}

function formatArchiveDate_(val, tz) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, tz || 'Europe/Berlin', 'yyyy-MM-dd');
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, tz || 'Europe/Berlin', 'yyyy-MM-dd');
  }
  return s;
}

function deleteOffer(fingerprint, initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  if (!fingerprint) {
    throw new Error('fingerprint is required');
  }

  const spreadsheet = getSpreadsheet();
  const deleted = deleteArchiveRowByFingerprint_(spreadsheet, fingerprint);
  if (deleted) {
    markFingerprintDismissed_(fingerprint);
  }

  return { success: true, deleted: deleted, fingerprint: fingerprint };
}

function checkOffersAvailabilityWeb(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  return checkOffersAvailability();
}

function getAnalytics(initData) {
  const secrets = getScriptSecrets();
  authorizeWebAppRequest_(initData, secrets);

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  if (!sheet || sheet.getLastRow() < 2) {
    return { dailyCounts: [], topRoutes: [], hourlyPattern: [], bySources: [] };
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, ARCHIVE_HEADERS.length)
    .getValues();

  const iFoundAt = ARCHIVE_HEADERS.indexOf('found_at');
  const iMatches = ARCHIVE_HEADERS.indexOf('matches_filter');
  const iOrigin  = ARCHIVE_HEADERS.indexOf('origin');
  const iDest    = ARCHIVE_HEADERS.indexOf('destination');
  const iSource  = ARCHIVE_HEADERS.indexOf('source');

  const dailyMap  = {};
  const routeMap  = {};
  const hourMap   = new Array(24).fill(0);
  const sourceMap = {};

  values.forEach(function(row) {
    const rawDate = row[iFoundAt];
    if (!rawDate) return;
    const d       = new Date(rawDate);
    const dateKey = Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
    const hour    = d.getUTCHours();
    const matched = row[iMatches] === true || String(row[iMatches]).toLowerCase() === 'true';
    const source  = String(row[iSource] || '').trim();
    const origin  = String(row[iOrigin] || '').trim();
    const dest    = String(row[iDest]   || '').trim();

    // daily totals
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, total: 0, matched: 0 };
    dailyMap[dateKey].total++;
    if (matched) dailyMap[dateKey].matched++;

    // top routes (matched only)
    if (matched && origin && dest) {
      const route = origin + ' → ' + dest;
      routeMap[route] = (routeMap[route] || 0) + 1;
    }

    // hourly pattern (matched only, UTC hours)
    if (matched) hourMap[hour]++;

    // by source
    if (source) {
      if (!sourceMap[source]) sourceMap[source] = { source: source, total: 0, matched: 0 };
      sourceMap[source].total++;
      if (matched) sourceMap[source].matched++;
    }
  });

  const dailyCounts = Object.values(dailyMap)
    .sort(function(a, b) { return a.date < b.date ? -1 : 1; })
    .slice(-30);

  const topRoutes = Object.keys(routeMap)
    .map(function(r) { return { route: r, count: routeMap[r] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 10);

  const hourlyPattern = hourMap.map(function(count, h) { return { hour: h, count: count }; });

  const bySources = Object.values(sourceMap).sort(function(a, b) { return b.total - a.total; });

  return {
    dailyCounts:   dailyCounts,
    topRoutes:     topRoutes,
    hourlyPattern: hourlyPattern,
    bySources:     bySources,
  };
}
function testUrl() {
  try {
    new URLSearchParams("a=1");
    console.log("URLSearchParams EXISTS");
  } catch(e) {
    console.log("URLSearchParams DOES NOT EXIST: " + e.message);
  }
}
