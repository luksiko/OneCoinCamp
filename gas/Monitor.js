function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Camper Monitor')
    .addItem('Initialize sheets', 'setupMonitor')
    .addItem('Run once', 'runMonitorOnce')
    .addItem('Install trigger', 'installTrigger')
    .addItem('🔄 Check offers availability', 'checkOffersAvailability')
    .addItem('🔗 Migrate Movacar archive links', 'migrateMovacarArchiveUrls')
    .addSeparator()
    .addItem('⚙️ Configure Telegram (Token & Chat ID)', 'configureTelegramSecrets')
    .addItem('🧪 Test Telegram connection', 'testTelegramConnection')
    .addItem('📥 Poll Telegram updates now', 'processTelegramUpdates')
    .addItem('📱 Configure Telegram Mini App', 'setupTelegramMiniApp')
    .addSeparator()
    .addItem('🌐 Register Telegram Webhook', 'setupTelegramWebhook')
    .addItem('❌ Delete Telegram Webhook', 'deleteTelegramWebhook')
    .addToUi();
}

function setupMonitor() {
  const spreadsheet = ensureWorkbook_();
  PropertiesService.getScriptProperties().setProperty(PROPERTY_KEYS.SPREADSHEET_ID, spreadsheet.getId());
  try {
    SpreadsheetApp.getUi().alert('✅ Таблицы инициализированы! ID таблицы сохранен.');
  } catch (e) {}
  return spreadsheet.getUrl();
}

function installTrigger() {
  const spreadsheet = ensureWorkbook_();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const interval = installMonitorTriggers_(settings);
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_INSTALLED_AT, new Date().toISOString());
  props.deleteProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_ALERT_ACTIVE);
  try {
    SpreadsheetApp.getUi().alert(
      '✅ Триггеры успешно установлены!\n\n' +
      '⏱ Мониторинг сайтов: каждые ' + interval + ' мин.\n' +
      '🔄 Проверка доступности: каждые 15 мин.\n' +
      '🤖 Telegram бот: каждую 1 мин.'
    );
  } catch (e) {}
}

function installMonitorTriggers_(settings) {
  const minutes = Number(settings.poll_interval_minutes || DEFAULT_SETTINGS.poll_interval_minutes);
  const allowed = [1, 5, 10, 15, 30];
  const interval = allowed.indexOf(minutes) === -1 ? 5 : minutes;
  const availMinutes = Number(settings.availability_check_interval_minutes || DEFAULT_SETTINGS.availability_check_interval_minutes || 60);

  const webhookActive = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.TELEGRAM_WEBHOOK_ACTIVE) === '1';

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    const fn = trigger.getHandlerFunction();
    if (fn === 'runMonitorOnce' || fn === 'pollOnce' || fn === 'processTelegramUpdates' || fn === 'checkMonitorFreshness' || fn === 'checkOffersAvailability') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('runMonitorOnce').timeBased().everyMinutes(interval).create();

  if (!webhookActive) {
    ScriptApp.newTrigger('processTelegramUpdates').timeBased().everyMinutes(1).create();
  }

  ScriptApp.newTrigger('checkMonitorFreshness').timeBased().everyMinutes(10).create();

  if (availMinutes >= 60) {
    const hours = Math.min(Math.max(1, Math.floor(availMinutes / 60)), 12);
    ScriptApp.newTrigger('checkOffersAvailability').timeBased().everyHours(hours).create();
  } else {
    const availInterval = allowed.indexOf(availMinutes) === -1 ? 15 : availMinutes;
    ScriptApp.newTrigger('checkOffersAvailability').timeBased().everyMinutes(availInterval).create();
  }

  return interval;
}

function ensureMonitorTriggers_() {
  const spreadsheet = ensureWorkbook_();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const minutes = Number(settings.poll_interval_minutes || DEFAULT_SETTINGS.poll_interval_minutes);
  const allowed = [1, 5, 10, 15, 30];
  const interval = allowed.indexOf(minutes) === -1 ? 5 : minutes;
  const availMinutes = Number(settings.availability_check_interval_minutes || DEFAULT_SETTINGS.availability_check_interval_minutes || 60);

  const webhookActive = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.TELEGRAM_WEBHOOK_ACTIVE) === '1';

  const existing = {};
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    existing[trigger.getHandlerFunction()] = true;
  });
  const created = [];
  if (!existing.runMonitorOnce) {
    ScriptApp.newTrigger('runMonitorOnce').timeBased().everyMinutes(interval).create();
    created.push('runMonitorOnce');
  }

  if (webhookActive) {
    if (existing.processTelegramUpdates) {
      ScriptApp.getProjectTriggers().forEach(function (trigger) {
        if (trigger.getHandlerFunction() === 'processTelegramUpdates') {
          ScriptApp.deleteTrigger(trigger);
        }
      });
    }
  } else if (!existing.processTelegramUpdates) {
    ScriptApp.newTrigger('processTelegramUpdates').timeBased().everyMinutes(1).create();
    created.push('processTelegramUpdates');
  }

  if (!existing.checkMonitorFreshness) {
    ScriptApp.newTrigger('checkMonitorFreshness').timeBased().everyMinutes(10).create();
    created.push('checkMonitorFreshness');
  }
  if (!existing.checkOffersAvailability) {
    if (availMinutes >= 60) {
      const hours = Math.min(Math.max(1, Math.floor(availMinutes / 60)), 12);
      ScriptApp.newTrigger('checkOffersAvailability').timeBased().everyHours(hours).create();
    } else {
      const availInterval = allowed.indexOf(availMinutes) === -1 ? 15 : availMinutes;
      ScriptApp.newTrigger('checkOffersAvailability').timeBased().everyMinutes(availInterval).create();
    }
    created.push('checkOffersAvailability');
  }
  return created;
}

function pollOnce() {
  return runMonitorOnce();
}

function checkMonitorFreshness() {
  const spreadsheet = ensureWorkbook_();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const freshness = getMonitorFreshness_(spreadsheet, settings);
  const props = PropertiesService.getScriptProperties();
  const alertActive = props.getProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_ALERT_ACTIVE) === '1';
  const secrets = getScriptSecrets();

  let repairNote = '';
  if (freshness.isStale && freshness.ageMinutes !== null) {
    try {
      const created = ensureMonitorTriggers_();
      if (created.length) {
        repairNote = '\n🔧 Пересозданы триггеры: ' + created.join(', ') + '.';
        props.setProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_INSTALLED_AT, new Date().toISOString());
      }
    } catch (e) {
      repairNote = '\n⚠️ Ошибка восстановления триггеров: ' + (e.message || String(e)).slice(0, 200);
    }
    try {
      runMonitorOnce();
      repairNote += '\n▶️ Запущена проверка вручную.';
    } catch (e) {
      repairNote += '\n❌ Ручная проверка не удалась: ' + (e.message || String(e)).slice(0, 200);
    }
  }

  if (!settings.telegram_enabled || !secrets.telegramBotToken || !secrets.telegramChatId) {
    return freshness;
  }

  if (freshness.isStale && !alertActive) {
    sendTelegramMessage_(
      secrets,
      '🔴 <b>Триггер мониторинга не выполнялся ' + freshness.ageMinutes + ' мин.</b>\n' +
        'Порог: ' + freshness.thresholdMinutes + ' мин.' +
        repairNote,
    );
    props.setProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_ALERT_ACTIVE, '1');
  } else if (!freshness.isStale && alertActive) {
    sendTelegramMessage_(secrets, '🟢 <b>Мониторинг восстановлен.</b> Последняя проверка: ' + freshness.ageMinutes + ' мин назад.');
    props.deleteProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_ALERT_ACTIVE);
  }

  return freshness;
}

function getMonitorFreshness_(spreadsheet, settings, now) {
  const intervalMinutes = Number(settings.poll_interval_minutes) || Number(DEFAULT_SETTINGS.poll_interval_minutes);
  const thresholdMinutes = intervalMinutes * 2;
  const runsSheet = spreadsheet.getSheetByName(SHEET_NAMES.RUNS);
  let lastRunAt = null;

  if (runsSheet && runsSheet.getLastRow() >= 2) {
    const headers = runsSheet.getRange(1, 1, 1, runsSheet.getLastColumn()).getValues()[0];
    const values = runsSheet.getRange(runsSheet.getLastRow(), 1, 1, runsSheet.getLastColumn()).getValues()[0];
    const finishedAtIndex = headers.indexOf('finished_at');
    const startedAtIndex = headers.indexOf('started_at');
    lastRunAt = values[finishedAtIndex] || values[startedAtIndex] || null;
  }

  let isInstalled = true;
  if (!lastRunAt) {
    lastRunAt = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.MONITOR_FRESHNESS_INSTALLED_AT) || null;
    isInstalled = !!lastRunAt;
  }

  const lastRunDate = lastRunAt ? new Date(lastRunAt) : null;
  const nowDate = now || new Date();
  const ageMinutes = lastRunDate && !isNaN(lastRunDate.getTime())
    ? Math.max(0, Math.floor((nowDate.getTime() - lastRunDate.getTime()) / 60000))
    : null;

  return {
    ageMinutes: ageMinutes,
    thresholdMinutes: thresholdMinutes,
    isStale: isInstalled && (ageMinutes === null || ageMinutes > thresholdMinutes),
  };
}

function runMonitorOnce() {
  const lock = LockService.getScriptLock();
  const startedAt = new Date();
  let spreadsheet = null;
  let requestCount = 0;

  if (!lock.tryLock(10000)) {
    try {
      spreadsheet = ensureWorkbook_();
      logRun_(spreadsheet, {
        startedAt: startedAt,
        finishedAt: new Date(),
        source: 'all',
        requestCount: 0,
        offersFound: 0,
        offersFiltered: 0,
        telegramSent: 0,
        status: 'SKIPPED',
        errorMessage: 'Другой запуск проверки уже выполняется (lock занят).',
      });
    } catch (logError) {}
    return;
  }

  try {
    spreadsheet = ensureWorkbook_();
    const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
    const globalFilters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
    
    // 1. Сбор маршрутов всех активных пользователей
    // 1. Сбор маршрутов всех активных пользователей
    const users = (typeof listActiveUsers === 'function') ? (listActiveUsers() || []) : [];
    const uniqueRoutesMap = {};
    const usersData = [];
    users.forEach(function(user) {
      const userRoutes = (typeof getUserRoutes === 'function') ? (getUserRoutes(user.telegram_id) || []) : [];
      const userFilters = (typeof getUserFilters === 'function') ? getUserFilters(user.telegram_id) : null;
      usersData.push({
        user: user,
        routes: userRoutes,
        filters: userFilters
      });
      userRoutes.forEach(function(route) {
        if (!route.enabled || !isProviderEnabled_(route.source, settings)) return;
        const normalizedRoute = Object.assign({}, route, {
          originId: route.originId != null ? route.originId : (route.origin_id != null ? String(route.origin_id) : ''),
          origin_id: route.origin_id != null ? route.origin_id : (route.originId != null ? String(route.originId) : ''),
          destinationId: route.destinationId != null ? route.destinationId : (route.destination_id != null ? String(route.destination_id) : ''),
          destination_id: route.destination_id != null ? route.destination_id : (route.destinationId != null ? String(route.destinationId) : ''),
          originCountry: route.originCountry || route.origin_country || '',
          origin_country: route.origin_country || route.originCountry || '',
          originName: route.originName || route.origin_name || '',
          origin_name: route.origin_name || route.originName || '',
          destinationName: route.destinationName || route.destination_name || '',
          destination_name: route.destination_name || route.destinationName || '',
          pickupDate: route.pickupDate || route.pickup_date || '',
          pickup_date: route.pickup_date || route.pickupDate || '',
          returnDate: route.returnDate || route.return_date || '',
          return_date: route.return_date || route.returnDate || '',
        });
        const hashKey = normalizedRoute.source + '|' + (normalizedRoute.origin_id || '') + '|' + (normalizedRoute.destination_id || '');
        if (!uniqueRoutesMap[hashKey]) {
          uniqueRoutesMap[hashKey] = normalizedRoute;
        }
      });
    });
    let routes = Object.keys(uniqueRoutesMap).map(function(k) { return uniqueRoutesMap[k]; });
    if (routes.length === 0) {
      const sheetRoutes = readRoutes_(spreadsheet);
      routes = sheetRoutes.filter(function(r) { return r.enabled && isProviderEnabled_(r.source, settings); });
    }

    const known = readArchiveFingerprints_(spreadsheet);
    const cache = CacheService.getScriptCache();
    const newOffers = [];
    const rowsToAppend = [];
    let hasErrors = false;
    let lastRouteError = '';

    const checkNeighbors = isTruthy_(settings.check_neighbors);

    // 2. Worker: сбор офферов
    routes.forEach(function (route, routeIndex) {
      const pickupDate = route.pickupDate || route.pickup_date || settings.pickup_date;
      const returnDate = route.returnDate || route.return_date || settings.return_date;
      const routeWindow = buildDateWindow_(settings, globalFilters, pickupDate, returnDate);
      const effectiveWindow = buildEffectiveWindow_(routeWindow, checkNeighbors);

      let offers = [];
      try {
        requestCount += 1;
        offers = fetchOffersForRoute_(route, effectiveWindow, globalFilters);
      } catch (error) {
        hasErrors = true;
        lastRouteError = error.message || String(error);
        logRun_(spreadsheet, {
          startedAt: startedAt,
          finishedAt: new Date(),
          source: route.source,
          requestCount: 1,
          offersFound: 0,
          offersFiltered: 0,
          telegramSent: 0,
          status: 'ERROR',
          errorMessage: lastRouteError,
        });
        return;
      }

      offers.forEach(function (offer) {
        const fingerprint = offerFingerprint_(offer);
        offer.fingerprint = fingerprint;
        const alreadyKnown = known.has(fingerprint) || cache.get(fingerprint) === '1' || isFingerprintDismissed_(fingerprint);

        if (alreadyKnown) {
          return;
        }
        
        const matches = isTruthy_(settings.notify_all_by_price)
          ? offerPriceMatches_(offer, settings.max_price_eur || globalFilters.max_price)
          : offerMatchesFilter_(offer, globalFilters, routeWindow);
        const rowIndex = rowsToAppend.length;
        newOffers.push({ offer: offer, fingerprint: fingerprint, matches: matches, route: route, routeIndex: routeIndex, routeWindow: routeWindow, rowIndex: rowIndex });
        rowsToAppend.push(offerToRow_(offer, fingerprint, matches, ''));
      });
    });

    // 3. Dispatcher: сверка с фильтрами и рассылка
    const secrets = getScriptSecrets();
    let telegramSentCount = 0;
    const failedFingerprints = new Set();

    if (usersData.length > 0) {
      usersData.forEach(function (data) {
        const filters = data.filters || {};
        const user = data.user;
        const userRoutes = data.routes || [];

        newOffers.forEach(function (item) {
          const offer = item.offer || item;
          const fp = item.fingerprint || offer.fingerprint;
          if (!fp) return;
          if (typeof matchesFirestoreFilter_ === 'function' && !matchesFirestoreFilter_(offer, filters, settings)) return;
          if (typeof hasAlertBeenSent === 'function' && hasAlertBeenSent(user.telegram_id, fp)) return;

          let matchedRouteId = null;
          for (let i = 0; i < userRoutes.length; i++) {
            const r = userRoutes[i];
            if (r.enabled && r.source === offer.source) {
              // Simplified match since offer has only names
              if ((!r.origin_name || r.origin_name === offer.origin) &&
                  (!r.destination_name || r.destination_name === offer.destination)) {
                matchedRouteId = r._id;
                break;
              }
            }
          }

          const sentAt = new Date();
          try {
            const userSettings = Object.assign({}, settings, {
              silent_hours_enabled: filters.silent_hours != null,
              silent_hours_start: filters.silent_hours ? filters.silent_hours.from : null,
              silent_hours_end: filters.silent_hours ? filters.silent_hours.to : null
            });
            sendTelegramOffer_(secrets, offer, item.route, matchedRouteId || item.routeIndex, userSettings, user.chat_id);
            telegramSentCount++;
            known.add(fp);
            cache.put(fp, '1', 21600);
          } catch (error) {
            hasErrors = true;
            failedFingerprints.add(fp);
            return;
          }

          if (typeof markAlertSent === 'function') {
            markAlertSent(user.telegram_id, fp, {
              source: offer.source, origin: offer.origin,
              destination: offer.destination, price: offer.price, sent_at: sentAt
            });
          }
        });
      });
    } else if (isTruthy_(settings.telegram_enabled) && secrets.telegramBotToken && secrets.telegramChatId) {
      newOffers.forEach(function (item) {
        const offer = item.offer || item;
        const pickupDate = offer.pickupDate || settings.pickup_date;
        const returnDate = offer.returnDate || settings.return_date;
        const window = item.routeWindow || buildDateWindow_(settings, globalFilters, pickupDate, returnDate);
        let shouldSend = false;
        if (isTruthy_(settings.notify_all_by_price)) {
          shouldSend = offerPriceMatches_(offer, settings.max_price_eur || globalFilters.max_price);
        } else {
          shouldSend = item.matches !== undefined ? item.matches : offerMatchesFilter_(offer, globalFilters, window);
        }
        if (shouldSend) {
          try {
            sendTelegramOffer_(secrets, offer, item.route, item.routeIndex, settings, secrets.telegramChatId);
            telegramSentCount++;
            known.add(item.fingerprint);
            cache.put(item.fingerprint, '1', 21600);
            if (item.rowIndex !== undefined && rowsToAppend[item.rowIndex]) {
              rowsToAppend[item.rowIndex][16] = formatIsoDate_(new Date());
            }
          } catch (e) {
            hasErrors = true;
            failedFingerprints.add(item.fingerprint);
          }
        } else {
          known.add(item.fingerprint);
          cache.put(item.fingerprint, '1', 21600);
        }
      });
    } else {
      newOffers.forEach(function (item) {
        known.add(item.fingerprint);
        cache.put(item.fingerprint, '1', 21600);
      });
    }

    const finalRowsToAppend = rowsToAppend.filter(function (row) {
      const fp = row[14];
      return !failedFingerprints.has(fp);
    });

    if (finalRowsToAppend.length) {
      appendArchiveRows_(spreadsheet, finalRowsToAppend);
    }


    logRun_(spreadsheet, {
      startedAt: startedAt,
      finishedAt: new Date(),
      source: 'all',
      requestCount: requestCount,
      offersFound: newOffers.length,
      offersFiltered: rowsToAppend.length,
      telegramSent: telegramSentCount,
      status: hasErrors ? 'PARTIAL' : 'OK',
      errorMessage: '',
    });

    if (!hasErrors) {
      PropertiesService.getScriptProperties().deleteProperty(PROPERTY_KEYS.MONITOR_LAST_ERROR);
    } else if (lastRouteError) {
      PropertiesService.getScriptProperties().setProperty(
        PROPERTY_KEYS.MONITOR_LAST_ERROR,
        startedAt.toISOString() + ' :: ' + lastRouteError.slice(0, 500)
      );
    }
  } catch (error) {
    const errorMessage = (error.message || String(error)).slice(0, 500);
    const props = PropertiesService.getScriptProperties();
    props.setProperty(PROPERTY_KEYS.MONITOR_LAST_ERROR, startedAt.toISOString() + ' :: ' + errorMessage);
    if (spreadsheet) {
      try {
        logRun_(spreadsheet, {
          startedAt: startedAt,
          finishedAt: new Date(),
          source: 'all',
          requestCount: requestCount,
          offersFound: 0,
          offersFiltered: 0,
          telegramSent: 0,
          status: 'ERROR',
          errorMessage: errorMessage,
        });
      } catch (logError) {}
    }
  } finally {
    lock.releaseLock();
  }
}

function buildStatusMessage_(spreadsheet, chatId) {
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const globalFilters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
  
  const filters = getUserFilters(chatId) || {};
  const routes = getUserRoutes(chatId) || [];
  const enabledRoutes = routes.filter(function (r) {
    return r.enabled;
  });

  const runsSheet = spreadsheet.getSheetByName(SHEET_NAMES.RUNS);
  let lastRunText = 'нет данных';
  let total24h = 0;

  if (runsSheet && runsSheet.getLastRow() > 1) {
    const data = runsSheet.getDataRange().getValues();
    const lastRow = data[data.length - 1];
    lastRunText = lastRow[0] ? Utilities.formatDate(new Date(lastRow[0]), settings.timezone || 'Europe/Berlin', 'yyyy-MM-dd HH:mm:ss') : 'нет данных';

    const oneDayAgo = new Date().getTime() - 24 * 60 * 60 * 1000;
    for (let i = 1; i < data.length; i++) {
      const rowDate = new Date(data[i][0]).getTime();
      if (rowDate >= oneDayAgo) {
        total24h += Number(data[i][4] || 0);
      }
    }
  }

  const health = checkProvidersHealth();
  const rsIcon = health.roadsurfer.ok ? '🟢' : '🔴';
  const mvIcon = health.movacar.ok ? '🟢' : '🔴';
  const tgIcon = health.telegram.ok ? '🟢' : '🔴';

  let lines = [
    '📊 <b>Статус Camper Monitor</b>',
    '',
    '🌐 <b>Связь с сайтами:</b>',
    '  ' + rsIcon + ' <b>Roadsurfer Rally:</b> ' + health.roadsurfer.message,
    '  ' + mvIcon + ' <b>Movacar:</b> ' + health.movacar.message,
    '  ' + tgIcon + ' <b>Telegram Bot:</b> ' + health.telegram.message,
    '',
    '⏱ Последний опрос: ' + lastRunText,
    '📈 Общих офферов за 24ч: ' + total24h,
    '🚗 Моих маршрутов (активных): ' + enabledRoutes.length,
    '',
    'Мои фильтры:',
    '  Откуда: ' + (filters.allowed_origin_countries ? filters.allowed_origin_countries.join(', ') : 'все'),
    '  Куда: ' + (filters.allowed_destination_countries ? filters.allowed_destination_countries.join(', ') : 'все'),
  ];

  if (filters.min_duration_days || filters.max_duration_days) {
    lines.push('  Длительность: ' + (filters.min_duration_days || '0') + '–' + (filters.max_duration_days || '∞') + ' дней');
  }

  const maxP = (filters.price_max != null && filters.price_max !== '') ? (filters.price_max + ' €') : 'любая';
  lines.push('  Макс. цена: ' + maxP);

  lines.push('');
  lines.push('Команды:');
  lines.push('/check — запустить сканирование прямо сейчас');
  lines.push('/routes — список моих маршрутов');
  return lines.join('\n');
}

function checkOffersAvailability() {
  const startedAt = new Date();
  let spreadsheet = null;
  let requestCount = 0;
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    // Another execution (e.g. runMonitorOnce) is holding the lock — skip this run
    return { checked: 0, removed: 0 };
  }

  try {
    spreadsheet = ensureWorkbook_();
    const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
    const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
    if (!sheet || sheet.getLastRow() < 2) {
      return { checked: 0, removed: 0 };
    }

    const totalDataRows = sheet.getLastRow() - 1;
    const values = sheet.getRange(2, 1, totalDataRows, ARCHIVE_HEADERS.length).getValues();
    const totalChecked = values.length;

    const sourceCol = ARCHIVE_HEADERS.indexOf('source');
    const offerIdCol = ARCHIVE_HEADERS.indexOf('offer_id');
    const pickupCol = ARCHIVE_HEADERS.indexOf('pickup_date');
    const bookingUrlCol = ARCHIVE_HEADERS.indexOf('booking_url');
    const fpCol = ARCHIVE_HEADERS.indexOf('fingerprint');

    const now = new Date();
    const todayStr = Utilities.formatDate(now, DEFAULT_SETTINGS.timezone, 'yyyy-MM-dd');
    const toRemoveFingerprints = new Set();

    const roadsurferPairs = {};
    const movacarPairs = {};

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const source = String(row[sourceCol] || '').trim();
      const offerId = String(row[offerIdCol] || '').trim();
      const pickupDate = String(row[pickupCol] || '').trim();
      const bookingUrl = String(row[bookingUrlCol] || '').trim();
      const fp = String(row[fpCol] || '').trim();

      if (!fp) continue;

      if (pickupDate && pickupDate < todayStr) {
        toRemoveFingerprints.add(fp);
        continue;
      }

      if (!isProviderEnabled_(source, settings)) {
        continue;
      }

      if (source === 'roadsurfer') {
        const stationMatch = bookingUrl.match(/[?&]station=(\d+)/);
        const endStationMatch = bookingUrl.match(/[?&]end_station=(\d+)/);
        if (stationMatch && endStationMatch) {
          const originId = stationMatch[1];
          const destId = endStationMatch[1];
          const key = originId + '_' + destId;
          if (!roadsurferPairs[key]) {
            roadsurferPairs[key] = { originId: originId, destId: destId, offers: [] };
          }
          roadsurferPairs[key].offers.push({ offerId: offerId, fingerprint: fp, pickupDate: pickupDate });
        }
      } else if (source === 'movacar') {
        const parts = offerId.split('@')[0].split('->');
        if (parts.length === 2 && parts[0] && parts[1]) {
          const originRef = parts[0];
          const destRef = parts[1];
          const key = originRef + '_' + destRef;
          if (!movacarPairs[key]) {
            movacarPairs[key] = { originRef: originRef, destRef: destRef, offers: [] };
          }
          movacarPairs[key].offers.push({ offerId: offerId, fingerprint: fp });
        }
      }
    }

    // Query Roadsurfer search API for each station pair
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rangeEnd = Utilities.formatDate(endDate, DEFAULT_SETTINGS.timezone, 'yyyy-MM-dd');

    const rsKeys = Object.keys(roadsurferPairs);
    for (let k = 0; k < rsKeys.length; k++) {
      const pair = roadsurferPairs[rsKeys[k]];
      const searchUrl =
        'https://booking.roadsurfer.com/api/en/rally/search?stations=' +
        encodeURIComponent('[[' + pair.originId + ',' + pair.destId + ']]') +
        '&range=' +
        encodeURIComponent(JSON.stringify([todayStr, rangeEnd])) +
        '&currency=EUR&models=' +
        encodeURIComponent('[]');
      const refererUrl =
        'https://booking.roadsurfer.com/en/rally/pick?station=' +
        encodeURIComponent(pair.originId) +
        '&end_station=' +
        encodeURIComponent(pair.destId);

      requestCount++;
      let payload = null;
      try {
        payload = fetchJson_(searchUrl, {
          headers: {
            Accept: 'application/json, text/plain, */*',
            Referer: refererUrl,
            'X-Requested-Alias': 'rally.search',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
      } catch (err) {
        // Fail-safe: do not remove offers on network or API failure
        continue;
      }

      if (payload) {
        const items = Array.isArray(payload) ? payload : payload.results || payload.data || [];
        const activeIds = new Set();
        for (let j = 0; j < items.length; j++) {
          const item = items[j];
          const id = firstDefined_(item.id, item.offer_id);
          if (id != null) {
            activeIds.add(String(id));
          }
        }
        for (let o = 0; o < pair.offers.length; o++) {
          const off = pair.offers[o];
          if (!activeIds.has(String(off.offerId))) {
            toRemoveFingerprints.add(off.fingerprint);
          }
        }
      }
      // Rate limit: avoid 429 / UrlFetchApp quota exhaustion
      if (k < rsKeys.length - 1) Utilities.sleep(500);
    }

    // Query Movacar API for each pair
    const mvKeys = Object.keys(movacarPairs);
    for (let m = 0; m < mvKeys.length; m++) {
      const mvPair = movacarPairs[mvKeys[m]];
      const query =
        'locale=de&origin_reference=' +
        encodeURIComponent(mvPair.originRef) +
        '&destination_reference=' +
        encodeURIComponent(mvPair.destRef);
      const url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?' + query;

      requestCount++;
      let payload = null;
      try {
        payload = fetchJson_(url, {
          headers: {
            Accept: 'application/vnd.api+json',
            Origin: 'https://movacar.com',
            Referer: 'https://movacar.com/',
            'X-Request-Id': randomRequestId_(),
          },
        });
      } catch (err) {
        // Fail-safe
        continue;
      }

      if (payload) {
        const included = payload.included || [];
        const destinationSummary = included.filter(function (item) {
          return item.type === 'locationsummary' && String(item.id) === String(mvPair.destRef);
        })[0];
        const offerCount = destinationSummary && destinationSummary.attributes ? destinationSummary.attributes.offer_count || 0 : 0;
        if (!offerCount) {
          for (let mo = 0; mo < mvPair.offers.length; mo++) {
            toRemoveFingerprints.add(mvPair.offers[mo].fingerprint);
          }
        }
      }
      // Rate limit: avoid 429 / UrlFetchApp quota exhaustion
      if (m < mvKeys.length - 1) Utilities.sleep(500);
    }

    const removedCount = deleteArchiveRowsByFingerprints_(spreadsheet, toRemoveFingerprints);

    PropertiesService.getScriptProperties().setProperty(
      PROPERTY_KEYS.OFFERS_AVAILABILITY_LAST_RUN,
      new Date().toISOString()
    );

    logRun_(spreadsheet, {
      startedAt: startedAt,
      finishedAt: new Date(),
      source: 'availability_check',
      requestCount: requestCount,
      offersFound: totalChecked,
      offersFiltered: removedCount,
      telegramSent: 0,
      status: 'OK',
      errorMessage: 'Removed ' + removedCount + ' unavailable offers',
    });

    return { checked: totalChecked, removed: removedCount };
  } catch (err) {
    if (spreadsheet) {
      logRun_(spreadsheet, {
        startedAt: startedAt,
        finishedAt: new Date(),
        source: 'availability_check',
        requestCount: requestCount,
        offersFound: 0,
        offersFiltered: 0,
        telegramSent: 0,
        status: 'ERROR',
        errorMessage: err.message || String(err),
      });
    }
    throw err;
  } finally {
    lock.releaseLock();
  }
}
