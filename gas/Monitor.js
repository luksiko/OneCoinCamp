function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Camper Monitor')
    .addItem('Initialize sheets', 'setupMonitor')
    .addItem('Run once', 'runMonitorOnce')
    .addItem('Install trigger', 'installTrigger')
    .addItem('🔄 Check offers availability', 'checkOffersAvailability')
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
    const filters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
    const secrets = getScriptSecrets();

    const routes = readRoutes_(spreadsheet).filter(function (route) {
      return route.enabled;
    });
    const known = readArchiveFingerprints_(spreadsheet);
    const cache = CacheService.getScriptCache();
    const foundOffers = [];
    const rowsToAppend = [];
    let telegramSentCount = 0;
    let hasErrors = false;

    const checkNeighbors = isTruthy_(settings.check_neighbors);

    routes.forEach(function (route, routeIndex) {
      // Build date windows per route. If route has no dates, fallback to global settings
      const pickupDate = route.pickupDate || settings.pickup_date;
      const routeWindow = buildDateWindow_(settings, filters, pickupDate, returnDate);
      const effectiveWindow = buildEffectiveWindow_(routeWindow, checkNeighbors);

      let offers = [];
      try {
        requestCount += 1;
        offers = fetchOffersForRoute_(route, effectiveWindow, filters);
      } catch (error) {
        hasErrors = true;
        logRun_(spreadsheet, {
          startedAt: startedAt,
          finishedAt: new Date(),
          source: route.source,
          requestCount: 1,
          offersFound: 0,
          offersFiltered: 0,
          telegramSent: 0,
          status: 'ERROR',
          errorMessage: error.message || String(error),
        });
        return;
      }

      offers.forEach(function (offer) {
        const fingerprint = offerFingerprint_(offer);
        const matches = offerMatchesFilter_(offer, filters, effectiveWindow);
        const alreadyKnown = known.has(fingerprint) || cache.get(fingerprint) === '1' || isFingerprintDismissed_(fingerprint);

        if (alreadyKnown) {
          return;
        }

        let telegramSentAt = '';
        if (matches && settings.telegram_enabled) {
          try {
            sendTelegramOffer_(secrets, offer, route, routeIndex, settings);
            telegramSentAt = formatIsoDate_(new Date());
            telegramSentCount += 1;
          } catch (error) {
            return;
          }
        }

        known.add(fingerprint);
        cache.put(fingerprint, '1', 21600);
        foundOffers.push(offer);
        rowsToAppend.push(offerToRow_(offer, fingerprint, matches, telegramSentAt));
      });
    });

    if (rowsToAppend.length) {
      appendArchiveRows_(spreadsheet, rowsToAppend);
    }

    logRun_(spreadsheet, {
      startedAt: startedAt,
      finishedAt: new Date(),
      source: 'all',
      requestCount: requestCount,
      offersFound: foundOffers.length,
      offersFiltered: rowsToAppend.length,
      telegramSent: telegramSentCount,
      status: hasErrors ? 'PARTIAL' : 'OK',
      errorMessage: '',
    });
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

function buildStatusMessage_(spreadsheet) {
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const filters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
  const routes = readRoutes_(spreadsheet);
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
    '📬 Интервал: ' + settings.poll_interval_minutes + ' мин',
    '📈 Офферов за 24ч: ' + total24h,
    '🚗 Активных маршрутов: ' + enabledRoutes.length,
    '',
    'Фильтры:',
    '  Откуда: ' + (filters.allowed_origin_countries || 'все'),
    '  Куда: ' + (filters.allowed_destination_countries || 'все'),
  ];

  if (filters.min_trip_days || filters.max_trip_days) {
    lines.push('  Длительность: ' + (filters.min_trip_days || '0') + '–' + (filters.max_trip_days || '∞') + ' дней');
  }

  lines.push('');
  lines.push('Команды:');
  lines.push('/check — запустить сканирование прямо сейчас');
  lines.push('/routes — список маршрутов');
  return lines.join('\n');
}

function checkOffersAvailability() {
  const startedAt = new Date();
  let spreadsheet = null;
  let requestCount = 0;

  try {
    spreadsheet = ensureWorkbook_();
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
  }
}

