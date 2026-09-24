function computeRouteHash_(route) {
  if (!route) return '';
  const raw = [
    route.source || '',
    route.originId !== undefined ? route.originId : route.origin_id || '',
    route.originName !== undefined ? route.originName : route.origin_name || '',
    route.destinationId !== undefined ? route.destinationId : route.destination_id || '',
    route.destinationName !== undefined ? route.destinationName : route.destination_name || '',
  ].join('|');
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  const hex = signature
    .map(function (byte) {
      const positive = (byte + 256) % 256;
      return positive.toString(16).padStart(2, '0');
    })
    .join('');
  return hex.substring(0, 10);
}

const OPERATOR_INFO_MAP = {
  'sixt': { name: 'Sixt', site: 'sixt.de' },
  'roadsurfer': { name: 'Roadsurfer', site: 'roadsurfer.com' },
  'indie campers': { name: 'Indie Campers', site: 'indiecampers.com' },
  'indiecampers': { name: 'Indie Campers', site: 'indiecampers.com' },
  'starcar': { name: 'Starcar', site: 'starcar.de' },
  'europcar': { name: 'Europcar', site: 'europcar.de' },
  'avis': { name: 'Avis', site: 'avis.de' },
  'hertz': { name: 'Hertz', site: 'hertz.de' },
  'imoova': { name: 'Imoova', site: 'imoova.com' },
  'movacar': { name: 'Movacar', site: 'movacar.com' },
};

function getSourceAndPartnerDisplay_(offer, meta) {
  const src = String(offer.source || '').toLowerCase().trim();
  const op = String((meta && meta.operator) || offer.operator || '').trim();
  const opKey = op.toLowerCase();
  const opInfo = OPERATOR_INFO_MAP[opKey] || (op ? { name: op, site: op.toLowerCase() + '.com' } : null);

  if (src === 'movacar') {
    let partnerStr = '';
    if (opInfo && opKey !== 'movacar') {
      partnerStr = '\n🌐 Сайт предложения / партнёр: <b>' + escapeHtml_(opInfo.name) + '</b> (' + escapeHtml_(opInfo.site) + ')';
    }
    return {
      headerSource: 'Movacar' + (opInfo && opKey !== 'movacar' ? ' (' + opInfo.name + ')' : ''),
      sourceLine: '🏢 Агрегатор: <b>Movacar</b> (movacar.com)' + partnerStr,
      shortLabel: 'Movacar' + (opInfo && opKey !== 'movacar' ? ' (' + opInfo.name + ' · ' + opInfo.site + ')' : ''),
    };
  } else if (src === 'roadsurfer') {
    return {
      headerSource: 'Roadsurfer Rally',
      sourceLine: '🏢 Провайдер: <b>Roadsurfer</b> (roadsurfer.com)',
      shortLabel: 'Roadsurfer (roadsurfer.com)',
    };
  } else if (src === 'indiecampers') {
    return {
      headerSource: 'Indie Campers',
      sourceLine: '🏢 Провайдер: <b>Indie Campers</b> (indiecampers.com)',
      shortLabel: 'Indie Campers (indiecampers.com)',
    };
  } else if (src === 'imoova') {
    return {
      headerSource: 'Imoova',
      sourceLine: '🏢 Провайдер: <b>Imoova</b> (imoova.com)',
      shortLabel: 'Imoova (imoova.com)',
    };
  } else {
    return {
      headerSource: escapeHtml_(offer.source),
      sourceLine: '🏢 Источник: <b>' + escapeHtml_(offer.source) + '</b>',
      shortLabel: escapeHtml_(offer.source),
    };
  }
}

function sendTelegramOffer_(secrets, offer, route, routeIndex, settings, chatId) {
  const targetChatId = chatId || secrets.telegramChatId;
  if (!secrets.telegramBotToken || !targetChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in Script Properties');
  }

  const userLang = (settings && settings.language) || (typeof resolveUserLanguage_ === 'function' ? resolveUserLanguage_(targetChatId) : 'en');

  let durationDays = '';
  if (offer.pickupDate && offer.returnDate) {
    const p = parseIsoDate_(offer.pickupDate);
    const r = parseIsoDate_(offer.returnDate);
    if (p && r) {
      const days = Math.round((r.getTime() - p.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        durationDays = (typeof pluralizeDays_ === 'function')
          ? pluralizeDays_(days, userLang)
          : (' (' + days + ' days)');
      }
    }
  }

  const meta = (typeof detectOfferVehicleMetadata_ === 'function')
    ? detectOfferVehicleMetadata_(offer)
    : { operator: offer.operator || 'Unknown', vehicleType: offer.vehicleType || 'camper', sleeping: offer.sleeping };
  const isCamper = meta.vehicleType === 'camper';
  const icon = isCamper ? '🚐' : '🚗';

  const displayInfo = getSourceAndPartnerDisplay_(offer, meta);

  const sleepingDesc = (isCamper && meta.sleeping)
    ? (typeof t_ === 'function' ? t_('sleeping_places', userLang, { count: meta.sleeping }) : (' (спальных мест: ' + meta.sleeping + ')'))
    : '';

  const typeDesc = isCamper
    ? (typeof t_ === 'function' ? t_('offer_type_camper', userLang, { sleeping: sleepingDesc }) : ('🚐 <b>Дом на колёсах' + sleepingDesc + '</b>'))
    : (typeof t_ === 'function' ? t_('offer_type_car', userLang, { operator: escapeHtml_(meta.operator || 'Sixt') }) : ('🚗 <b>Легковой авто (' + escapeHtml_(meta.operator || 'Sixt') + ', без спальных мест)</b>'));

  const vehicleLine = offer.vehicle
    ? (typeof t_ === 'function' ? t_('vehicle_model', userLang, { icon: icon, model: escapeHtml_(offer.vehicle) }) : ('\n' + icon + ' Модель: <b>' + escapeHtml_(offer.vehicle) + '</b>'))
    : '';
  
  let priceLine = '';
  let priceSuffix = '!';
  if (offer.price !== '' && offer.price != null) {
    const numPrice = Number(offer.price);
    const numTotal = (offer.totalPrice != null && offer.totalPrice !== '') ? Number(offer.totalPrice) : null;
    if (!isNaN(numPrice)) {
      if (numPrice === 1 && (!numTotal || numTotal === 1)) {
        priceSuffix = (typeof t_ === 'function') ? t_('price_suffix_1eur', userLang) : ' за 1€!';
        priceLine = (typeof t_ === 'function') ? t_('price_line_1eur', userLang) : '\n💶 Цена: <b>1 €</b>';
      } else if (numTotal && numTotal !== numPrice) {
        priceSuffix = (typeof t_ === 'function') ? t_('price_suffix_from', userLang, { price: numPrice }) : (' от ' + numPrice + '€/сутки!');
        priceLine = (typeof t_ === 'function') ? t_('price_line_daily', userLang, { price: escapeHtml_(String(numPrice)), total: escapeHtml_(String(numTotal)) }) : ('\n💶 Цена: <b>' + escapeHtml_(String(numPrice)) + '</b> € / сутки (всего: <b>' + escapeHtml_(String(numTotal)) + '</b> €)');
      } else {
        priceSuffix = (typeof t_ === 'function') ? t_('price_suffix_price', userLang, { price: numPrice }) : (' за ' + numPrice + '€!');
        priceLine = (typeof t_ === 'function') ? t_('price_line_fixed', userLang, { price: escapeHtml_(String(numPrice)) }) : ('\n💶 Цена: <b>' + escapeHtml_(String(numPrice)) + '</b> €');
      }
    }
  }

  const buttonLabel = (typeof t_ === 'function') ? t_('btn_book', userLang) : 'Забронировать оффер ➔';
  const typeLabel = (typeof t_ === 'function') ? t_('offer_type_label', userLang) : '🏷 Тип: ';

  const headerText = isCamper
    ? (typeof t_ === 'function' ? t_('offer_title_camper', userLang, { icon: icon, source: displayInfo.headerSource, priceSuffix: priceSuffix }) : (icon + ' <b>' + displayInfo.headerSource + ' — найден кемпер' + priceSuffix + '</b>'))
    : (typeof t_ === 'function' ? t_('offer_title_car', userLang, { icon: icon, source: displayInfo.headerSource, priceSuffix: priceSuffix }) : (icon + ' <b>' + displayInfo.headerSource + ' — найден легковой авто' + priceSuffix + '</b>'));

  const text =
    headerText + '\n\n' +
    displayInfo.sourceLine + '\n' +
    '📍 ' + escapeHtml_(offer.origin) + ' ➔ ' + escapeHtml_(offer.destination) + '\n' +
    '📅 ' + escapeHtml_(offer.pickupDate || '') + ' – ' + escapeHtml_(offer.returnDate || '') + durationDays + '\n' +
    typeLabel + typeDesc +
    vehicleLine +
    priceLine;

  const keyboard = [];
  if (offer.bookingUrl) {
    keyboard.push([
      {
        text: buttonLabel,
        url: offer.bookingUrl,
      },
    ]);
  }

  if (routeIndex != null) {
    const rHash = computeRouteHash_(route);
    const cbData = rHash ? ('dis_r:' + routeIndex + ':' + rHash) : ('dis_r:' + String(routeIndex).substring(0, 30));
    const disableText = (typeof t_ === 'function') ? t_('btn_disable_route', userLang) : '🚫 Отключить этот маршрут';
    keyboard.push([
      {
        text: disableText,
        callback_data: cbData,
      },
    ]);
  }

  const payload = {
    chat_id: targetChatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };

  if (keyboard.length > 0) {
    payload.reply_markup = { inline_keyboard: keyboard };
  }

  if (settings && isSilentHoursActive_(settings)) {
    payload.disable_notification = true;
  }

  const result = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/sendMessage', {
    method: 'post',
    payload: JSON.stringify(payload),
    retries: 1,
  });

  if (!result || result.ok !== true) {
    throw new Error('Telegram sendMessage failed: ' + ((result && result.description) || 'no ok=true in response'));
  }
}

function sendTelegramMessage_(secrets, text, chatId, replyMarkup) {
  const targetChatId = chatId || secrets.telegramChatId;
  if (!secrets.telegramBotToken || !targetChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing');
  }
  const payload = {
    chat_id: targetChatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  const result = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/sendMessage', {
    method: 'post',
    payload: JSON.stringify(payload),
    retries: 1,
  });
  if (!result || result.ok !== true) {
    throw new Error('Telegram sendMessage failed: ' + ((result && result.description) || 'no ok=true in response'));
  }
}

function handleTelegramWebhook(e) {
  try {
    const secrets = getScriptSecrets();
    const expectedSecret = secrets.telegramWebhookSecret;
    if (expectedSecret && e && e.parameter && (e.parameter.secret || e.parameter.secret_token)) {
      const provided = e.parameter.secret || e.parameter.secret_token;
      if (provided !== expectedSecret) {
        return HtmlService.createHtmlOutput('Unauthorized');
      }
    }

    if (!e || !e.postData || !e.postData.contents) {
      return HtmlService.createHtmlOutput('ok');
    }
    const update = JSON.parse(e.postData.contents);

    // DEBUG LOGGING — disable in production by setting WEBHOOK_DEBUG=false in script properties
    const debugEnabled = PropertiesService.getScriptProperties().getProperty('WEBHOOK_DEBUG') === 'true';
    if (debugEnabled) {
      try {
        firestoreAdd('webhook_logs', { timestamp: new Date().toISOString(), update: update });
      } catch (logErr) {}
    }

    handleTelegramUpdate_(update);
  } catch (error) {
    try {
      // Always log errors (but consider using a TTL cleanup job — see cleanupWebhookLogs_)
      firestoreAdd('webhook_logs', { timestamp: new Date().toISOString(), error: error.message || String(error), stack: error.stack });
    } catch (e) {}
    try {
      const secrets = getScriptSecrets();
      sendTelegramMessage_(secrets, '⚠️ <b>Критическая ошибка вебхука</b>\n\n<code>' + (error.message || String(error)) + '</code>\n\n' + (error.stack || ''), secrets.telegramChatId);
    } catch (e) {}
  }
  return HtmlService.createHtmlOutput('ok');
}

/**
 * Schedule this function to run daily to purge webhook_logs older than 7 days.
 * Set it as a time-driven trigger in Apps Script triggers panel.
 */
function cleanupWebhookLogs_() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const docs = firestoreQuery('webhook_logs', [{ field: 'timestamp', op: '<', value: cutoff }]);
    if (docs && docs.length) {
      docs.forEach(function (doc) {
        try { firestoreDelete('webhook_logs/' + doc.id); } catch (e) {}
      });
    }
  } catch (e) {
    // Fail silently — cleanup is best-effort
  }
}


function answerTelegramCallbackQuery_(secrets, callbackQueryId, text, showAlert) {
  if (!secrets.telegramBotToken || !callbackQueryId) return;
  try {
    fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/answerCallbackQuery', {
      method: 'post',
      payload: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || '',
        show_alert: !!showAlert,
      }),
      retries: 0,
    });
  } catch (e) {}
}

function editTelegramMessageReplyMarkup_(secrets, chatId, messageId, replyMarkup) {
  if (!secrets.telegramBotToken || !chatId || !messageId) return;
  try {
    fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/editMessageReplyMarkup', {
      method: 'post',
      payload: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup || { inline_keyboard: [] },
      }),
      retries: 0,
    });
  } catch (e) {}
}

function handleTelegramCallbackQuery_(callbackQuery) {
  if (!callbackQuery) return;
  const secrets = getScriptSecrets();
  const queryId = callbackQuery.id;
  const data = String(callbackQuery.data || '');
  const fromUser = callbackQuery.from;
  const message = callbackQuery.message;
  const chatId = message && message.chat && message.chat.id != null ? String(message.chat.id) : '';

  const telegramId = fromUser ? fromUser.id : null;
  const userLang = (typeof resolveUserLanguage_ === 'function')
    ? resolveUserLanguage_(telegramId, fromUser ? fromUser.language_code : null)
    : 'en';

  if (data === 'none' || data === 'disabled_already') {
    const msg = (typeof t_ === 'function') ? t_('alert_route_already_disabled', userLang) : 'Маршрут уже отключен.';
    answerTelegramCallbackQuery_(secrets, queryId, msg, false);
    return;
  }

  if (data.indexOf('set_lang:') === 0) {
    const chosenLang = data.split(':')[1];
    const normalized = (typeof normalizeLanguage_ === 'function') ? normalizeLanguage_(chosenLang) : chosenLang;
    if (telegramId && typeof setUserLanguage === 'function') {
      try {
        setUserLanguage(telegramId, normalized);
      } catch (e) {}
    }
    const confirmMsg = (typeof t_ === 'function') ? t_('lang_changed', normalized) : ('Language set to ' + normalized);
    answerTelegramCallbackQuery_(secrets, queryId, confirmMsg, false);
    if (message && message.message_id && chatId) {
      sendTelegramMessage_(secrets, confirmMsg, chatId);
    }
    return;
  }

  if (data.indexOf('dis_r:') === 0) {
    const routeParam = data.substring(6);
    const parts = routeParam.split(':');
    let success = false;
    const hasFirestore = typeof isFirestoreConfigured_ === 'function' && isFirestoreConfigured_();
    const isAdmin = Boolean(!secrets.telegramChatId || (telegramId && (String(telegramId) === String(secrets.telegramChatId) || (secrets.telegramAllowedUsers && secrets.telegramAllowedUsers.indexOf(String(telegramId)) !== -1))));

    if ((isAdmin || !hasFirestore) && parts.length >= 1 && !isNaN(Number(parts[0]))) {
      const idx = Number(parts[0]);
      try {
        const spreadsheet = ensureWorkbook_();
        const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ROUTES);
        if (sheet && sheet.getLastRow() >= idx + 2) {
          sheet.getRange(idx + 2, 1, 1, 1).setValues([[false]]);
          success = true;
        }
      } catch (e) {}
    }

    if (telegramId && hasFirestore && typeof firestoreUpdate === 'function') {
      try {
        firestoreUpdate('users/' + telegramId + '/routes/' + routeParam, { enabled: false });
        if (typeof clearUserCache === 'function') clearUserCache(telegramId);
        success = true;
      } catch (e) {}
    }

    const disabledAlert = (typeof t_ === 'function') ? t_('alert_route_disabled', userLang) : 'Маршрут отключен! 🚫';
    answerTelegramCallbackQuery_(secrets, queryId, disabledAlert, false);

    // Update inline keyboard on message
    if (message && message.message_id && chatId) {
      const existingMarkup = message.reply_markup || {};
      const newKeyboard = [];
      const oldKeyboard = existingMarkup.inline_keyboard || [];
      const disabledBtnText = (typeof t_ === 'function') ? t_('btn_route_disabled', userLang) : 'Маршрут отключен 🚫';
      for (let r = 0; r < oldKeyboard.length; r++) {
        const row = oldKeyboard[r];
        const newRow = [];
        for (let c = 0; c < row.length; c++) {
          const btn = row[c];
          if (btn.callback_data && btn.callback_data.indexOf('dis_r:') === 0) {
            newRow.push({
              text: disabledBtnText,
              callback_data: 'disabled_already',
            });
          } else {
            newRow.push(btn);
          }
        }
        if (newRow.length) {
          newKeyboard.push(newRow);
        }
      }
      editTelegramMessageReplyMarkup_(secrets, chatId, message.message_id, { inline_keyboard: newKeyboard });
    }
  }
}

function buildDigestMessage_(spreadsheet, chatId) {
  const lang = (typeof resolveUserLanguage_ === 'function') ? resolveUserLanguage_(chatId) : 'en';
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  if (!sheet || sheet.getLastRow() < 2) {
    return (typeof t_ === 'function') ? t_('digest_empty', lang) : '📋 <b>Дневной дайджест</b>\n\nЗа последние 24 часа новых офферов не найдено.';
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, ARCHIVE_HEADERS.length).getValues();
  const oneDayAgo = new Date().getTime() - 24 * 60 * 60 * 1000;
  const recentOffers = [];

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const foundAt = row[0] ? new Date(row[0]).getTime() : 0;
    if (foundAt >= oneDayAgo) {
      recentOffers.push({
        source: row[1] || '',
        vehicle: row[4] || '',
        origin: row[5] || '',
        destination: row[7] || '',
        pickupDate: row[9] || '',
        returnDate: row[10] || '',
        price: row[11],
        url: row[13] || '',
        rawJson: row[17] || '',
      });
    }
  }

  if (recentOffers.length === 0) {
    return (typeof t_ === 'function') ? t_('digest_empty', lang) : '📋 <b>Дневной дайджест</b>\n\nЗа последние 24 часа новых офферов не найдено.';
  }

  const bookLabel = (typeof t_ === 'function') ? t_('actual_book_link', lang) : 'Забронировать ➔';
  const lines = [
    (typeof t_ === 'function') ? t_('digest_title', lang) : '📋 <b>Дневной дайджест (за 24ч):</b>',
    (typeof t_ === 'function') ? t_('digest_found', lang, { count: recentOffers.length }) : ('Найдено слотов: ' + recentOffers.length + '\n'),
  ];

  const maxItems = Math.min(recentOffers.length, 10);
  for (let j = 0; j < maxItems; j++) {
    const off = recentOffers[j];
    const meta = (typeof detectOfferVehicleMetadata_ === 'function')
      ? detectOfferVehicleMetadata_(off)
      : { operator: off.operator || off.source, vehicleType: 'camper' };
    const icon = meta.vehicleType === 'camper' ? '🚐' : '🚗';
    const displayInfo = (typeof getSourceAndPartnerDisplay_ === 'function')
      ? getSourceAndPartnerDisplay_(off, meta)
      : { shortLabel: off.source };
    let itemLine = (j + 1) + '. ' + icon + ' <b>' + escapeHtml_(displayInfo.shortLabel) + '</b>: ' +
      escapeHtml_(off.origin) + ' ➔ ' + escapeHtml_(off.destination);
    if (off.pickupDate && off.returnDate) {
      itemLine += ' (' + escapeHtml_(off.pickupDate) + ' – ' + escapeHtml_(off.returnDate) + ')';
    }
    if (off.price) {
      itemLine += ' — <b>' + escapeHtml_(String(off.price)) + '€</b>';
    }
    if (off.url) {
      itemLine += '\n   <a href="' + escapeHtml_(off.url, true) + '">' + bookLabel + '</a>';
    }
    lines.push(itemLine);
  }

  if (recentOffers.length > maxItems) {
    lines.push((typeof t_ === 'function') ? t_('digest_more', lang, { count: recentOffers.length - maxItems }) : ('\n... и еще ' + (recentOffers.length - maxItems) + ' слотов в архиве.'));
  }

  return lines.join('\n');
}

function buildActualOffersMessage_(spreadsheet, chatId) {
  const lang = (typeof resolveUserLanguage_ === 'function') ? resolveUserLanguage_(chatId) : 'en';
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  if (!sheet || sheet.getLastRow() < 2) {
    return (typeof t_ === 'function') ? t_('actual_empty', lang) : '📋 <b>Актуальные предложения</b>\n\nНа данный момент предложений нет.';
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, ARCHIVE_HEADERS.length).getValues();
  const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  
  const filters = (typeof getUserFilters === 'function' ? getUserFilters(chatId) : null) || readKeyValueSheet_(spreadsheet, SHEET_NAMES.FILTERS, DEFAULT_FILTERS);
  let routes = (typeof getUserRoutes === 'function' ? getUserRoutes(chatId) : null);
  if (!routes || routes.length === 0) {
    routes = readRoutes_(spreadsheet);
  }
  const enabledRoutes = routes.filter(function(r) { return r.enabled; });

  const actualOffers = [];
  const now = new Date();
  const todayStr = Utilities.formatDate(now, settings.timezone || 'Europe/Berlin', 'yyyy-MM-dd');

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const offer = {
      source: row[1] || '',
      vehicle: row[4] || '',
      origin: row[5] || '',
      originCountry: row[6] || '',
      destination: row[7] || '',
      destinationCountry: row[8] || '',
      pickupDate: row[9] || '',
      returnDate: row[10] || '',
      price: row[11],
      bookingUrl: row[13] || '',
      rawJson: row[17] || '',
    };
    
    if (offer.pickupDate && offer.pickupDate < todayStr) {
      continue;
    }
    
    let matchedRoute = null;
    if (enabledRoutes.length > 0) {
      for (let rIdx = 0; rIdx < enabledRoutes.length; rIdx++) {
        const r = enabledRoutes[rIdx];
        const m = (typeof routeMatchesOffer_ === 'function')
          ? routeMatchesOffer_(r, offer)
          : (r.source === offer.source &&
             (!r.origin_name || r.origin_name === '*' || r.origin_name.toLowerCase().trim() === String(offer.origin || '').toLowerCase().trim()) &&
             (!r.destination_name || r.destination_name === '*' || r.destination_name.toLowerCase().trim() === String(offer.destination || '').toLowerCase().trim()));
        if (m) {
          matchedRoute = r;
          break;
        }
      }
      if (!matchedRoute) {
        continue;
      }
    }
    
    if (!offerMatchesFilter_(offer, filters, null, settings, matchedRoute)) {
      continue;
    }
    
    actualOffers.push(offer);
  }

  if (actualOffers.length === 0) {
    return (typeof t_ === 'function') ? t_('actual_empty', lang) : '📋 <b>Актуальные предложения</b>\n\nПо вашим фильтрам и маршрутам актуальных предложений не найдено.';
  }

  const bookLabel = (typeof t_ === 'function') ? t_('actual_book_link', lang) : 'Забронировать ➔';
  const lines = [
    (typeof t_ === 'function') ? t_('actual_title', lang) : '📋 <b>Актуальные предложения:</b>',
    (typeof t_ === 'function') ? t_('actual_found', lang, { count: actualOffers.length }) : ('Найдено слотов: ' + actualOffers.length + '\n'),
  ];

  const maxItems = Math.min(actualOffers.length, 10);
  for (let j = 0; j < maxItems; j++) {
    const off = actualOffers[j];
    const meta = (typeof detectOfferVehicleMetadata_ === 'function')
      ? detectOfferVehicleMetadata_(off)
      : { operator: off.operator || off.source, vehicleType: 'camper' };
    const icon = meta.vehicleType === 'camper' ? '🚐' : '🚗';
    const displayInfo = (typeof getSourceAndPartnerDisplay_ === 'function')
      ? getSourceAndPartnerDisplay_(off, meta)
      : { shortLabel: off.source };
    let itemLine = (j + 1) + '. ' + icon + ' <b>' + escapeHtml_(displayInfo.shortLabel) + '</b>: ' +
      escapeHtml_(off.origin) + ' ➔ ' + escapeHtml_(off.destination);
    if (off.pickupDate && off.returnDate) {
      itemLine += ' (' + escapeHtml_(off.pickupDate) + ' – ' + escapeHtml_(off.returnDate) + ')';
    }
    if (off.price) {
      itemLine += ' — <b>' + escapeHtml_(String(off.price)) + '€</b>';
    }
    if (off.bookingUrl) {
      itemLine += '\n   <a href="' + escapeHtml_(off.bookingUrl, true) + '">' + bookLabel + '</a>';
    }
    lines.push(itemLine);
  }

  if (actualOffers.length > maxItems) {
    lines.push((typeof t_ === 'function') ? t_('actual_more', lang, { count: actualOffers.length - maxItems }) : ('\n... и еще ' + (actualOffers.length - maxItems) + ' слотов.'));
  }

  return lines.join('\n');
}

function handleTelegramUpdate_(update) {
  if (!update) {
    return;
  }
  if (update.callback_query) {
    handleTelegramCallbackQuery_(update.callback_query);
    return;
  }
  if (!update.message) {
    return;
  }
  const message = update.message;
  if (!message.text) {
    return;
  }

  const secrets = getScriptSecrets();
  const incomingChatId = message.chat && message.chat.id != null ? String(message.chat.id) : '';
  
  if (!incomingChatId) {
    return;
  }

  const text = message.text.trim();
  const chatId = incomingChatId;

  const userId = message.from && message.from.id ? String(message.from.id) : chatId;
  const userLang = (typeof resolveUserLanguage_ === 'function')
    ? resolveUserLanguage_(userId, message.from ? message.from.language_code : null)
    : 'en';

  if (message.from && message.from.id) {
    try {
      upsertUser(message.from.id, chatId, {
        username: message.from.username || '',
        language: userLang
      });
    } catch(e) {}
  }

  const command = text.split(/\s+/)[0].split('@')[0];

  if (command === '/start') {
    const welcome = (typeof t_ === 'function') ? t_('start_welcome', userLang) : 'Camper Monitor Bot';
    try {
      sendTelegramMessage_(secrets, welcome, chatId);
    } catch(err) {
      try { firestoreAdd('webhook_logs', { timestamp: new Date().toISOString(), error_start: err.message || String(err), chatId: chatId }); } catch(e) {}
    }
  } else if (command === '/help') {
    const help = (typeof t_ === 'function') ? t_('help_text', userLang) : 'Camper Monitor Help';
    sendTelegramMessage_(secrets, help, chatId);
  } else if (command === '/status') {
    const spreadsheet = ensureWorkbook_();
    const statusText = buildStatusMessage_(spreadsheet, chatId);
    try { sendTelegramMessage_(secrets, statusText, chatId); } catch (e) {}
  } else if (command === '/digest') {
    const spreadsheet = ensureWorkbook_();
    const digestText = buildDigestMessage_(spreadsheet, chatId);
    try { sendTelegramMessage_(secrets, digestText, chatId); } catch (e) {}
  } else if (command === '/lang' || command === '/language') {
    const parts = text.split(/\s+/);
    if (parts.length > 1 && parts[1]) {
      const chosenLang = (typeof normalizeLanguage_ === 'function') ? normalizeLanguage_(parts[1]) : parts[1];
      if (typeof setUserLanguage === 'function') {
        try { setUserLanguage(userId, chosenLang); } catch (e) {}
      }
      const msg = (typeof t_ === 'function') ? t_('lang_changed', chosenLang) : ('Language set to ' + chosenLang);
      sendTelegramMessage_(secrets, msg, chatId);
      return;
    }
    const promptText = (typeof t_ === 'function') ? t_('lang_prompt', userLang) : 'Choose language:';
    const keyboard = (typeof buildLanguageKeyboard_ === 'function') ? buildLanguageKeyboard_() : [];
    sendTelegramMessage_(secrets, promptText, chatId, { inline_keyboard: keyboard });
  } else if (command === '/silent') {
    let filters = (typeof getUserFilters === 'function' ? getUserFilters(userId) : null) || {};
    const parts = text.split(/\s+/);
    const spreadsheet = ensureWorkbook_();
    const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
    
    if (parts.length > 1) {
      const mode = parts[1].toLowerCase();
      if (mode === 'on') {
        filters.silent_hours = { enabled: true, start: '23:00', end: '07:00' };
        settings.silent_hours_enabled = true;
        settings.silent_hours_start = '23:00';
        settings.silent_hours_end = '07:00';
        writeKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, settings);
        sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('silent_on', userLang) : 'Silent hours enabled.', chatId);
      } else if (mode === 'off') {
        filters.silent_hours = { enabled: false };
        settings.silent_hours_enabled = false;
        writeKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, settings);
        sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('silent_off', userLang) : 'Silent hours disabled.', chatId);
      } else if (mode.includes('-')) {
        const times = mode.split('-');
        if (times.length === 2 && /^\d{1,2}:\d{2}$/.test(times[0]) && /^\d{1,2}:\d{2}$/.test(times[1])) {
          filters.silent_hours = { enabled: true, start: times[0], end: times[1] };
          settings.silent_hours_enabled = true;
          settings.silent_hours_start = times[0];
          settings.silent_hours_end = times[1];
          writeKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, settings);
          sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('silent_set', userLang, { start: times[0], end: times[1] }) : ('Silent hours: ' + times[0] + ' - ' + times[1]), chatId);
        } else {
          sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('silent_invalid_format', userLang) : 'Invalid format. Example: /silent 22:00-08:00', chatId);
        }
      }
      if (typeof setUserFilters === 'function') {
        setUserFilters(userId, filters);
      }
    } else {
      const isEnabled = (filters.silent_hours && filters.silent_hours.enabled) || isTruthy_(settings.silent_hours_enabled);
      const statusVal = isEnabled ? ((typeof t_ === 'function') ? t_('status_enabled', userLang) : 'ENABLED') : ((typeof t_ === 'function') ? t_('status_disabled', userLang) : 'DISABLED');
      let msg = (typeof t_ === 'function') ? t_('silent_status_header', userLang, { status: statusVal }) : ('Silent hours: ' + statusVal + '\n');
      if (isEnabled) {
        const sStart = (filters.silent_hours && filters.silent_hours.start) || settings.silent_hours_start || '23:00';
        const sEnd = (filters.silent_hours && filters.silent_hours.end) || settings.silent_hours_end || '07:00';
        msg += (typeof t_ === 'function') ? t_('silent_status_interval', userLang, { start: sStart, end: sEnd }) : ('Interval: ' + sStart + ' - ' + sEnd + '\n\n');
      }
      msg += (typeof t_ === 'function') ? t_('silent_usage', userLang) : '/silent on | off';
      sendTelegramMessage_(secrets, msg, chatId);
    }
  } else if (command === '/campers' || command === '/vehicle') {
    sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('campers_info', userLang) : 'Vehicle type info', chatId);
  } else if (command === '/actual') {
    const spreadsheet = ensureWorkbook_();
    const actualText = buildActualOffersMessage_(spreadsheet, userId);
    try { sendTelegramMessage_(secrets, actualText, chatId); } catch (e) {}
  } else if (command === '/check') {
    sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('check_starting', userLang) : 'Starting scan...', chatId);
    runMonitorOnce();
    sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('check_finished', userLang) : 'Scan completed.', chatId);
  } else if (command === '/clear_routes' || command === '/reset_routes') {
    if (typeof deleteAllUserRoutes === 'function') {
      deleteAllUserRoutes(userId);
    }
    sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('routes_cleared', userLang) : 'All routes cleared.', chatId);
  } else if (command === '/routes') {
    const routes = (typeof getUserRoutes === 'function' ? getUserRoutes(userId) : []) || [];
    const allCitiesLabel = (typeof t_ === 'function') ? t_('routes_all_cities', userLang) : 'All cities';
    const routeWord = (typeof t_ === 'function') ? t_('routes_route_word', userLang) : 'route';
    let lines = [(typeof t_ === 'function') ? t_('routes_header', userLang) : 'Tracked routes:\n'];
    routes.forEach(function (r) {
      const statusIcon = r.enabled ? '✅' : '⬜';
      const origCountry = r.origin_country || r.originCountry || '';
      const destCountry = r.destination_country || r.destinationCountry || '';
      const origFlag = origCountry ? flagEmoji_(origCountry) + ' ' : '';
      const isWildOrig = (r.origin_id === '*' || r.originId === '*' || (typeof isWildcardCityName_ === 'function' && isWildcardCityName_(r.origin_name || r.originName)));
      const isWildDest = (r.destination_id === '*' || r.destinationId === '*' || (typeof isWildcardCityName_ === 'function' && isWildcardCityName_(r.destination_name || r.destinationName)));
      const origCity = isWildOrig ? allCitiesLabel : (r.origin_name || r.originName || r.origin_id || r.originId || allCitiesLabel);
      const destCity = isWildDest ? allCitiesLabel : (r.destination_name || r.destinationName || r.destination_id || r.destinationId || allCitiesLabel);
      lines.push(statusIcon + ' <b>' + (r.source || routeWord).toUpperCase() + '</b>: ' + origFlag + origCity + ' ➔ ' + destFlag + destCity);
    });
    if (routes.length === 0) lines.push((typeof t_ === 'function') ? t_('routes_empty', userLang) : 'No routes.');
    sendTelegramMessage_(secrets, lines.join('\n'), chatId);
  } else {
    sendTelegramMessage_(secrets, (typeof t_ === 'function') ? t_('unknown_command', userLang) : 'Unknown command. Use /help', chatId);
  }
}

function processTelegramUpdates() {
  const secrets = getScriptSecrets();
  if (!secrets.telegramBotToken) {
    return;
  }
  const props = PropertiesService.getScriptProperties();
  const lastId = Number(props.getProperty('TELEGRAM_LAST_UPDATE_ID') || 0);
  const offset = lastId > 0 ? lastId + 1 : 0;
  let result;
  try {
    result = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/getUpdates?offset=' + offset + '&limit=10&timeout=0', {
      muteHttpExceptions: true,
      retries: 0,
    });
  } catch (e) {
    return;
  }
  if (!result || !result.ok || !Array.isArray(result.result)) {
    return;
  }
  let maxId = lastId;
  result.result.forEach(function (update) {
    if (update.update_id > maxId) {
      maxId = update.update_id;
    }
    handleTelegramUpdate_(update);
  });
  if (maxId > lastId) {
    props.setProperty('TELEGRAM_LAST_UPDATE_ID', String(maxId));
  }
}

function configureTelegramSecrets() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const currentToken = props.getProperty(PROPERTY_KEYS.TELEGRAM_BOT_TOKEN) || '';
  const currentChatId = props.getProperty(PROPERTY_KEYS.TELEGRAM_CHAT_ID) || '';

  const tokenResponse = ui.prompt(
    'Настройка Telegram бота',
    'Введите TELEGRAM_BOT_TOKEN (от @BotFather):' + (currentToken ? '\n(Текущий: ' + currentToken.slice(0, 10) + '...)' : ''),
    ui.ButtonSet.OK_CANCEL
  );
  if (tokenResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  const newToken = tokenResponse.getResponseText().trim() || currentToken;

  const chatResponse = ui.prompt(
    'Настройка Telegram бота',
    'Введите TELEGRAM_CHAT_ID (ваш Chat ID или ID группы):\n(Текущий: ' + (currentChatId || 'не задан') + ')',
    ui.ButtonSet.OK_CANCEL
  );
  if (chatResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  const newChatId = chatResponse.getResponseText().trim() || currentChatId;

  if (newToken) {
    props.setProperty(PROPERTY_KEYS.TELEGRAM_BOT_TOKEN, newToken);
  }
  if (newChatId) {
    props.setProperty(PROPERTY_KEYS.TELEGRAM_CHAT_ID, newChatId);
  }

  ui.alert('✅ Настройки сохранены!\nTELEGRAM_BOT_TOKEN: ' + (newToken ? 'OK' : 'пусто') + '\nTELEGRAM_CHAT_ID: ' + (newChatId || 'пусто'));
}

function testTelegramConnection() {
  const ui = SpreadsheetApp.getUi();
  const secrets = getScriptSecrets();

  if (!secrets.telegramBotToken) {
    ui.alert('❌ Ошибка: TELEGRAM_BOT_TOKEN не задан!\nИспользуйте меню "Camper Monitor → Configure Telegram Bot".');
    return;
  }
  if (!secrets.telegramChatId) {
    ui.alert('❌ Ошибка: TELEGRAM_CHAT_ID не задан!\nИспользуйте меню "Camper Monitor → Configure Telegram Bot".');
    return;
  }

  try {
    const me = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/getMe');
    if (!me || !me.ok) {
      ui.alert('❌ Ошибка токена бота: ' + ((me && me.description) || 'неверный токен'));
      return;
    }

    const botName = me.result && me.result.username ? '@' + me.result.username : 'Bot';
    sendTelegramMessage_(
      secrets,
      '🚐 <b>Camper Monitor</b>\n✅ Тестовое сообщение успешно отправлено!\nБот: ' + botName + '\nChat ID: <code>' + secrets.telegramChatId + '</code>'
    );
    ui.alert('✅ Успех!\nБот: ' + botName + '\nТестовое сообщение отправлено в чат ID: ' + secrets.telegramChatId);
  } catch (error) {
    ui.alert('❌ Ошибка отправки в Telegram:\n' + (error.message || ''));
  }
}

function setupTelegramMiniApp() {
  const secrets = getScriptSecrets();
  if (!secrets.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing in Script Properties');
  }

  const webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) {
    throw new Error('Web App is not deployed');
  }

  const result = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/setChatMenuButton', {
    method: 'post',
    payload: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: 'Открыть монитор',
        web_app: { url: webAppUrl },
      },
    }),
  });

  if (!result || result.ok !== true) {
    throw new Error('Telegram setChatMenuButton failed: ' + ((result && result.description) || 'unknown error'));
  }

  return { ok: true, webAppUrl: webAppUrl };
}

function isTelegramWebhookActive_() {
  return PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.TELEGRAM_WEBHOOK_ACTIVE) === '1';
}

function removeTelegramPollingTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'processTelegramUpdates') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function ensureTelegramPollingTrigger_() {
  let found = false;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'processTelegramUpdates') {
      found = true;
    }
  });
  if (!found) {
    ScriptApp.newTrigger('processTelegramUpdates').timeBased().everyMinutes(1).create();
  }
}

function registerTelegramWebhookCore_() {
  const secrets = getScriptSecrets();
  if (!secrets.telegramBotToken) {
    return { ok: false, message: 'TELEGRAM_BOT_TOKEN не задан в Script Properties' };
  }
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    return { ok: false, message: 'Сначала опубликуйте Web App (Deploy -> New deployment -> Web app)!' };
  }

  let secret = secrets.telegramWebhookSecret;
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '');
    PropertiesService.getScriptProperties().setProperty(PROPERTY_KEYS.TELEGRAM_WEBHOOK_SECRET, secret);
  }

  const webhookUrl = url + (url.indexOf('?') === -1 ? '?' : '&') + 'secret=' + encodeURIComponent(secret);
  const payload = {
    url: webhookUrl,
    secret_token: secret,
  };

  try {
    const res = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/setWebhook', {
      method: 'post',
      payload: JSON.stringify(payload),
    });
    if (res && res.ok) {
      PropertiesService.getScriptProperties().setProperty(PROPERTY_KEYS.TELEGRAM_WEBHOOK_ACTIVE, '1');
      removeTelegramPollingTrigger_();
      return { ok: true, message: 'Webhook успешно установлен! Поминутный поллинг отключен для экономии квоты.' };
    } else {
      return { ok: false, message: 'Ошибка установки Webhook: ' + ((res && res.description) || 'неизвестная ошибка') };
    }
  } catch (error) {
    return { ok: false, message: 'Ошибка установки Webhook: ' + (error.message || String(error)) };
  }
}

function deleteTelegramWebhookCore_() {
  const secrets = getScriptSecrets();
  if (!secrets.telegramBotToken) {
    return { ok: false, message: 'TELEGRAM_BOT_TOKEN не задан в Script Properties' };
  }
  try {
    const res = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/deleteWebhook');
    if (res && res.ok) {
      PropertiesService.getScriptProperties().deleteProperty(PROPERTY_KEYS.TELEGRAM_WEBHOOK_ACTIVE);
      ensureTelegramPollingTrigger_();
      return { ok: true, message: 'Webhook удален. Включен фоновый поллинг Telegram.' };
    } else {
      return { ok: false, message: 'Ошибка удаления Webhook: ' + ((res && res.description) || 'неизвестная ошибка') };
    }
  } catch (e) {
    return { ok: false, message: 'Ошибка удаления Webhook: ' + (e.message || String(e)) };
  }
}

function setupTelegramWebhook() {
  const res = registerTelegramWebhookCore_();
  try {
    SpreadsheetApp.getUi().alert((res.ok ? '✅ ' : '❌ ') + res.message);
  } catch (e) {}
  return res;
}

function deleteTelegramWebhook() {
  const res = deleteTelegramWebhookCore_();
  try {
    SpreadsheetApp.getUi().alert((res.ok ? '✅ ' : '❌ ') + res.message);
  } catch (e) {}
  return res;
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function flagEmoji_(code) {
  if (!code || typeof code !== 'string' || code.length !== 2) return '';
  code = code.toUpperCase();
  var offset = 127397;
  return String.fromCodePoint(code.charCodeAt(0) + offset) + String.fromCodePoint(code.charCodeAt(1) + offset);
}

