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

function getUiData() {
  const spreadsheet = getSpreadsheet();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const filters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
  const routes = readRoutes_(spreadsheet);
  const dateWindow = buildDateWindow_(settings, filters);
  const secrets = getScriptSecrets();
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

function checkProvidersHealth() {
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
    const routesCount = rs && rs.routes ? rs.routes.length : (Array.isArray(rs) ? rs.length : 0);
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
          Origin: 'https://movacar.com',
          Referer: 'https://movacar.com/',
          'X-Request-Id': randomRequestId_(),
        },
        retries: 0,
      }
    );
    const ms = new Date().getTime() - t0;
    const count = mv && mv.included ? mv.included.length : 0;
    result.movacar = { ok: true, message: 'Онлайн (' + count + ' локаций, ' + ms + 'мс)' };
  } catch (e) {
    result.movacar = { ok: false, message: 'Ошибка: ' + (e.message || String(e)).slice(0, 50) };
  }

  // 3. Telegram
  const secrets = getScriptSecrets();
  if (secrets.telegramBotToken) {
    try {
      const tg = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/getMe', { retries: 0 });
      if (tg && tg.ok && tg.result) {
        result.telegram = { ok: true, message: '@' + (tg.result.username || 'bot') + ' (OK)' };
      } else {
        result.telegram = { ok: false, message: 'Ошибка токена' };
      }
    } catch (e) {
      result.telegram = { ok: false, message: 'Ошибка связи с Telegram API' };
    }
  }

  return result;
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
      lastRun[String(h)] = values[i];
    });
  }
  return {
    intervalMinutes: interval,
    lastRun: lastRun,
  };
}

function saveUiData(payload) {
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
  return getUiData();
}

function runMonitorFromUi() {
  runMonitorOnce();
  return getUiData();
}
