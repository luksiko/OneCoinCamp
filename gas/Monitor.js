function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Camper Monitor')
    .addItem('Initialize sheets', 'setupMonitor')
    .addItem('Run once', 'runMonitorOnce')
    .addItem('Install trigger', 'installTrigger')
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
  const minutes = Number(settings.poll_interval_minutes || DEFAULT_SETTINGS.poll_interval_minutes);
  const allowed = [1, 5, 10, 15, 30];
  const interval = allowed.indexOf(minutes) === -1 ? 5 : minutes;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    const fn = trigger.getHandlerFunction();
    if (fn === 'runMonitorOnce' || fn === 'pollOnce' || fn === 'processTelegramUpdates') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('runMonitorOnce').timeBased().everyMinutes(interval).create();
  ScriptApp.newTrigger('processTelegramUpdates').timeBased().everyMinutes(1).create();
  try {
    SpreadsheetApp.getUi().alert(
      '✅ Триггеры успешно установлены!\n\n' +
      '⏱ Мониторинг сайтов: каждые ' + interval + ' мин.\n' +
      '🤖 Telegram бот: каждую 1 мин.'
    );
  } catch (e) {}
}

function pollOnce() {
  return runMonitorOnce();
}

function runMonitorOnce() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return;
  }
  const startedAt = new Date();
  const spreadsheet = ensureWorkbook_();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  const filters = readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
  const secrets = getScriptSecrets();
  const window = buildDateWindow_(settings, filters);
  const routes = readRoutes_(spreadsheet).filter(function (route) {
    return route.enabled;
  });
  const known = readArchiveFingerprints_(spreadsheet);
  const cache = CacheService.getScriptCache();
  const foundOffers = [];
  const rowsToAppend = [];
  let requestCount = 0;
  let telegramSentCount = 0;
  let hasErrors = false;

  try {
    routes.forEach(function (route) {
      let offers = [];
      try {
        requestCount += 1;
        offers = fetchOffersForRoute_(route, window, filters);
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
        const matches = offerMatchesFilter_(offer, filters, window);
        const alreadyKnown = known.has(fingerprint) || cache.get(fingerprint) === '1';

        if (alreadyKnown) {
          return;
        }

        let telegramSentAt = '';
        if (matches && settings.telegram_enabled) {
          try {
            sendTelegramOffer_(secrets, offer);
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

    if (!hasErrors) {
      logRun_(spreadsheet, {
        startedAt: startedAt,
        finishedAt: new Date(),
        source: 'all',
        requestCount: requestCount,
        offersFound: foundOffers.length,
        offersFiltered: rowsToAppend.length,
        telegramSent: telegramSentCount,
        status: 'OK',
        errorMessage: '',
      });
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
